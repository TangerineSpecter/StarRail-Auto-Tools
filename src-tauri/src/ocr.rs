use std::{
    fs,
    path::{Path, PathBuf},
    process,
    sync::{Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use oar_ocr::{
    core::config::OrtSessionConfig,
    oarocr::{OAROCRBuilder, OAROCR},
    utils::load_image,
};

use crate::{
    domain::{OcrImageResult, OcrTextRegion},
    error::AppError,
};

static OCR_RUNTIME: OnceLock<Mutex<OAROCR>> = OnceLock::new();

fn required_file(path: PathBuf) -> Result<PathBuf, AppError> {
    if path.is_file() {
        Ok(path)
    } else {
        Err(AppError::MissingFile(path.display().to_string()))
    }
}

pub fn recognize_image(
    image_path: String,
    models: (PathBuf, PathBuf, PathBuf),
) -> Result<OcrImageResult, AppError> {
    let image_path = required_file(PathBuf::from(&image_path))?;
    let detection_model = required_file(models.0)?;
    let recognition_model = required_file(models.1)?;
    let character_dictionary = required_file(models.2)?;

    let started = Instant::now();
    if OCR_RUNTIME.get().is_none() {
        let logical_cores = std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(2);
        let ocr_threads = (logical_cores / 2).clamp(1, 4);
        let runtime =
            OAROCRBuilder::new(&detection_model, &recognition_model, &character_dictionary)
                .ort_session(
                    OrtSessionConfig::new()
                        .with_intra_threads(ocr_threads)
                        .with_inter_threads(1)
                        .with_parallel_execution(false),
                )
                .image_batch_size(1)
                .region_batch_size(4)
                .build()
                .map_err(|error| AppError::Ocr(error.to_string()))?;
        let _ = OCR_RUNTIME.set(Mutex::new(runtime));
    }
    let ocr = OCR_RUNTIME
        .get()
        .ok_or_else(|| AppError::Ocr("OCR Runtime 初始化失败".to_owned()))?
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    let image =
        load_image(Path::new(&image_path)).map_err(|error| AppError::Ocr(error.to_string()))?;
    let results = ocr
        .predict(vec![image])
        .map_err(|error| AppError::Ocr(error.to_string()))?;

    let regions = results
        .into_iter()
        .flat_map(|result| result.text_regions)
        .filter_map(|region| region.text)
        .filter(|text| !text.trim().is_empty())
        .map(|text| OcrTextRegion {
            text: text.to_string(),
        })
        .collect();

    Ok(OcrImageResult {
        image_path: image_path.display().to_string(),
        regions,
        elapsed_ms: started.elapsed().as_millis(),
    })
}

/// Runs OCR on an in-memory PNG captured by the UI. The image only exists on disk
/// while the OCR library is reading it, then is removed regardless of the outcome.
pub fn recognize_screenshot(
    image_bytes: Vec<u8>,
    models: (PathBuf, PathBuf, PathBuf),
) -> Result<OcrImageResult, AppError> {
    if image_bytes.is_empty() {
        return Err(AppError::Ocr("截图内容为空".to_owned()));
    }

    let temporary_path = std::env::temp_dir().join(format!(
        "starrail-auto-tools-{}-{}.png",
        process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
    ));
    fs::write(&temporary_path, image_bytes)
        .map_err(|error| AppError::Ocr(format!("无法保存临时截图：{error}")))?;

    let result = recognize_image(temporary_path.display().to_string(), models);
    let _ = fs::remove_file(&temporary_path);

    result.map(|mut ocr_result| {
        ocr_result.image_path = "临时截图（已清理）".to_owned();
        ocr_result
    })
}
