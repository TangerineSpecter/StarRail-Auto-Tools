use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use reqwest::{header::RANGE, StatusCode};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::error::AppError;

pub const MODEL_REVISION: &str =
    "det-37b02eded8dbca659f8ee5d51f822ea1ebd9bcba_rec-ba215b1cc49d9ed4459d161b96778e8643fe0c1f";

const MODEL_FILES: &[ModelFile] = &[
    ModelFile {
        name: "text_detection.onnx",
        repository: "PaddlePaddle/PP-OCRv6_small_det_onnx",
        revision: "37b02eded8dbca659f8ee5d51f822ea1ebd9bcba",
        remote_name: "inference.onnx",
        sha256: "d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e",
        size: 9_880_512,
    },
    ModelFile {
        name: "text_recognition.onnx",
        repository: "PaddlePaddle/PP-OCRv6_small_rec_onnx",
        revision: "ba215b1cc49d9ed4459d161b96778e8643fe0c1f",
        remote_name: "inference.onnx",
        sha256: "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634",
        size: 21_159_378,
    },
    ModelFile {
        name: "recognition-config.yml",
        repository: "PaddlePaddle/PP-OCRv6_small_rec_onnx",
        revision: "ba215b1cc49d9ed4459d161b96778e8643fe0c1f",
        remote_name: "inference.yml",
        sha256: "ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1",
        size: 150_579,
    },
];

#[derive(Clone, Copy)]
struct ModelFile {
    name: &'static str,
    repository: &'static str,
    revision: &'static str,
    remote_name: &'static str,
    sha256: &'static str,
    size: u64,
}

impl ModelFile {
    fn url(self) -> String {
        format!(
            "https://www.modelscope.cn/models/{}/resolve/{}/{}",
            self.repository, self.revision, self.remote_name
        )
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrModelStatus {
    pub state: String,
    pub revision: String,
    pub directory: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub current_file: Option<String>,
    pub message: String,
}

#[derive(Clone)]
pub struct OcrModelManager {
    directory: PathBuf,
    app: AppHandle,
    status: Arc<Mutex<OcrModelStatus>>,
    cancel: Arc<AtomicBool>,
}

impl OcrModelManager {
    pub fn new(app_data: &Path, app: AppHandle) -> Self {
        let directory = app_data.join("models/pp-ocrv6-small").join(MODEL_REVISION);
        let status = OcrModelStatus {
            state: "missing".to_owned(),
            revision: MODEL_REVISION.to_owned(),
            directory: directory.display().to_string(),
            downloaded_bytes: 0,
            total_bytes: MODEL_FILES.iter().map(|file| file.size).sum(),
            current_file: None,
            message: "模型尚未下载".to_owned(),
        };
        let manager = Self {
            directory,
            app,
            status: Arc::new(Mutex::new(status)),
            cancel: Arc::new(AtomicBool::new(false)),
        };
        let _ = manager.verify();
        manager
    }

    pub fn paths(&self) -> Result<(PathBuf, PathBuf, PathBuf), AppError> {
        let status = self.snapshot()?;
        if status.state != "ready" {
            return Err(AppError::OcrModel("PP-OCRv6 small 模型尚未就绪".to_owned()));
        }
        Ok((
            self.directory.join("text_detection.onnx"),
            self.directory.join("text_recognition.onnx"),
            self.directory.join("character_dict.txt"),
        ))
    }

    pub fn snapshot(&self) -> Result<OcrModelStatus, AppError> {
        self.status
            .lock()
            .map(|status| status.clone())
            .map_err(|_| AppError::StateUnavailable)
    }

    pub fn verify(&self) -> Result<OcrModelStatus, AppError> {
        if matches!(
            self.snapshot()?.state.as_str(),
            "downloading" | "cancelling"
        ) {
            return Err(AppError::OcrModel(
                "模型下载进行中，不能同时校验".to_owned(),
            ));
        }
        let mut valid = true;
        let mut downloaded = 0_u64;
        for spec in MODEL_FILES {
            let path = self.directory.join(spec.name);
            if path.exists() {
                downloaded += path.metadata()?.len().min(spec.size);
            }
            if !verify_file(&path, spec.sha256)? {
                valid = false;
            }
        }
        let dictionary = self.directory.join("character_dict.txt");
        if valid && !dictionary.exists() {
            if let Err(error) =
                build_dictionary(&self.directory.join("recognition-config.yml"), &dictionary)
            {
                self.set_status("invalid", downloaded, None, error.to_string())?;
                return self.snapshot();
            }
        }
        self.set_status(
            if valid {
                "ready"
            } else if downloaded > 0 {
                "partial"
            } else {
                "missing"
            },
            downloaded,
            None,
            if valid {
                "PP-OCRv6 small 模型校验通过"
            } else {
                "模型缺失或校验失败"
            },
        )?;
        self.snapshot()
    }

    pub fn start_download(&self) -> Result<OcrModelStatus, AppError> {
        fs::create_dir_all(&self.directory)?;
        let snapshot = {
            let mut status = self.status.lock().map_err(|_| AppError::StateUnavailable)?;
            if !begin_download(&mut status) {
                return Ok(status.clone());
            }
            self.cancel.store(false, Ordering::SeqCst);
            status.clone()
        };
        let _ = self.app.emit("ocr-model://progress", snapshot);
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = manager.download_all().await {
                let cancelled = manager.cancel.load(Ordering::SeqCst);
                let _ = manager.set_status(
                    if cancelled { "cancelled" } else { "error" },
                    manager
                        .snapshot()
                        .map(|value| value.downloaded_bytes)
                        .unwrap_or_default(),
                    None,
                    error.to_string(),
                );
            }
        });
        self.snapshot()
    }

    pub fn cancel_download(&self) -> Result<OcrModelStatus, AppError> {
        self.cancel.store(true, Ordering::SeqCst);
        self.set_status(
            "cancelling",
            self.snapshot()?.downloaded_bytes,
            None,
            "正在取消下载",
        )?;
        self.snapshot()
    }

    pub fn delete_cache(&self) -> Result<OcrModelStatus, AppError> {
        if matches!(
            self.snapshot()?.state.as_str(),
            "downloading" | "cancelling"
        ) {
            return Err(AppError::OcrModel("请先取消正在进行的模型下载".to_owned()));
        }
        if self.directory.exists() {
            fs::remove_dir_all(&self.directory)?;
        }
        self.set_status("missing", 0, None, "模型缓存已删除")?;
        self.snapshot()
    }

    async fn download_all(&self) -> Result<(), AppError> {
        let client = reqwest::Client::builder()
            .user_agent("StarRail-Auto-Tools/1.0")
            .build()
            .map_err(|error| AppError::OcrModel(error.to_string()))?;
        let mut completed = 0_u64;
        for spec in MODEL_FILES {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(AppError::OcrModel("下载已取消".to_owned()));
            }
            let destination = self.directory.join(spec.name);
            if verify_file(&destination, spec.sha256)? {
                completed += spec.size;
                continue;
            }
            let temporary = destination.with_extension(format!(
                "{}part",
                destination
                    .extension()
                    .and_then(|v| v.to_str())
                    .unwrap_or_default()
            ));
            let mut offset = temporary
                .metadata()
                .map(|meta| meta.len())
                .unwrap_or_default();
            if offset >= spec.size {
                fs::remove_file(&temporary)?;
                offset = 0;
            }
            self.set_status(
                "downloading",
                completed + offset,
                Some(spec.name),
                "正在从 ModelScope 下载",
            )?;
            let mut request = client.get(spec.url());
            if offset > 0 {
                request = request.header(RANGE, format!("bytes={offset}-"));
            }
            let mut response = request
                .send()
                .await
                .map_err(|error| AppError::OcrModel(error.to_string()))?;
            if !response.status().is_success() {
                return Err(AppError::OcrModel(format!(
                    "ModelScope 返回 HTTP {}",
                    response.status()
                )));
            }
            if offset > 0 && response.status() != StatusCode::PARTIAL_CONTENT {
                offset = 0;
                let _ = fs::remove_file(&temporary);
            }
            let mut output = OpenOptions::new()
                .create(true)
                .append(offset > 0)
                .write(true)
                .truncate(offset == 0)
                .open(&temporary)?;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|error| AppError::OcrModel(error.to_string()))?
            {
                if self.cancel.load(Ordering::SeqCst) {
                    return Err(AppError::OcrModel("下载已取消，可稍后断点续传".to_owned()));
                }
                output.write_all(&chunk)?;
                offset += chunk.len() as u64;
                self.set_status(
                    "downloading",
                    completed + offset,
                    Some(spec.name),
                    "正在从 ModelScope 下载",
                )?;
            }
            output.flush()?;
            output.sync_all()?;
            if !verify_file(&temporary, spec.sha256)? {
                let _ = fs::remove_file(&temporary);
                return Err(AppError::OcrModel(format!(
                    "{} 的 SHA-256 校验失败",
                    spec.name
                )));
            }
            if destination.exists() {
                fs::remove_file(&destination)?;
            }
            fs::rename(&temporary, &destination)?;
            completed += spec.size;
        }
        build_dictionary(
            &self.directory.join("recognition-config.yml"),
            &self.directory.join("character_dict.txt"),
        )?;
        self.set_status(
            "ready",
            completed,
            None,
            "PP-OCRv6 small 模型下载并校验完成",
        )?;
        Ok(())
    }

    fn set_status(
        &self,
        state: &str,
        downloaded_bytes: u64,
        current_file: Option<&str>,
        message: impl Into<String>,
    ) -> Result<(), AppError> {
        let mut status = self.status.lock().map_err(|_| AppError::StateUnavailable)?;
        status.state = state.to_owned();
        status.downloaded_bytes = downloaded_bytes.min(status.total_bytes);
        status.current_file = current_file.map(str::to_owned);
        status.message = message.into();
        let snapshot = status.clone();
        drop(status);
        let _ = self.app.emit("ocr-model://progress", snapshot);
        Ok(())
    }
}

fn begin_download(status: &mut OcrModelStatus) -> bool {
    if matches!(
        status.state.as_str(),
        "downloading" | "cancelling" | "ready"
    ) {
        return false;
    }
    status.state = "downloading".to_owned();
    status.current_file = None;
    status.message = "正在准备模型下载".to_owned();
    true
}

fn verify_file(path: &Path, expected: &str) -> Result<bool, AppError> {
    let Ok(mut file) = File::open(path) else {
        return Ok(false);
    };
    file.seek(SeekFrom::Start(0))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()) == expected)
}

fn build_dictionary(source: &Path, destination: &Path) -> Result<(), AppError> {
    let text = fs::read_to_string(source)?;
    let marker = "character_dict:";
    let start = text
        .find(marker)
        .ok_or_else(|| AppError::OcrModel("识别配置中缺少 character_dict".to_owned()))?;
    let mut characters = Vec::new();
    for line in text[start + marker.len()..].lines().skip(1) {
        let Some(raw) = line.strip_prefix("  - ") else {
            break;
        };
        let value = if raw.starts_with('\'') && raw.ends_with('\'') && raw.len() >= 2 {
            raw[1..raw.len() - 1].replace("''", "'")
        } else if raw.starts_with('"') && raw.ends_with('"') {
            serde_json::from_str::<String>(raw)
                .map_err(|error| AppError::OcrModel(format!("识别字典转义无效：{error}")))?
        } else {
            raw.to_owned()
        };
        characters.push(value);
    }
    if characters.len() < 1000 {
        return Err(AppError::OcrModel(
            "识别字典条目不足，拒绝加载不完整模型".to_owned(),
        ));
    }
    let temporary = destination.with_extension("txt.part");
    fs::write(&temporary, format!("{}\n", characters.join("\n")))?;
    fs::rename(temporary, destination)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_manifest_is_pinned_and_sized() {
        assert!(!MODEL_REVISION.contains("master"));
        assert_eq!(
            MODEL_FILES.iter().map(|file| file.size).sum::<u64>(),
            31_190_469
        );
        assert!(MODEL_FILES.iter().all(|file| file.revision.len() == 40));
    }

    #[test]
    fn only_one_download_can_claim_the_status() {
        let mut status = OcrModelStatus {
            state: "missing".to_owned(),
            revision: MODEL_REVISION.to_owned(),
            directory: String::new(),
            downloaded_bytes: 0,
            total_bytes: 1,
            current_file: None,
            message: String::new(),
        };
        assert!(begin_download(&mut status));
        assert!(!begin_download(&mut status));
    }
}
