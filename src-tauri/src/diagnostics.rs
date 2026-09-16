use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

const MAX_BACKEND_LOG_BYTES: u64 = 512 * 1024;
const MAX_EXPORTED_FRONTEND_LOG_BYTES: usize = 256 * 1024;

#[derive(Clone)]
pub struct BackendDiagnostics {
    path: PathBuf,
    file: Arc<Mutex<Option<File>>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEnvironment {
    pub app_version: String,
    pub platform: String,
    pub user_agent: String,
    pub language: String,
    pub viewport: String,
    pub device_pixel_ratio: f64,
    pub hardware_concurrency: Option<u32>,
    pub frame_rate: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticExportRequest {
    pub environment: DiagnosticEnvironment,
    pub frontend_log: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticReport {
    schema_version: u32,
    generated_at: u128,
    backend_version: &'static str,
    environment: DiagnosticEnvironment,
    backend_log: String,
    frontend_log: String,
}

impl BackendDiagnostics {
    pub fn new(data_dir: &Path) -> Self {
        let path = data_dir.join("diagnostics").join("backend.jsonl");
        let file = open_log_file(&path);
        Self {
            path,
            file: Arc::new(Mutex::new(file)),
        }
    }

    pub fn record(&self, level: &str, component: &str, message: impl AsRef<str>) {
        let entry = serde_json::json!({
            "at": now_millis(),
            "level": level,
            "component": component,
            "message": message.as_ref(),
        });
        let Ok(line) = serde_json::to_string(&entry) else {
            return;
        };
        let Ok(mut file) = self.file.lock() else {
            return;
        };
        let Some(file) = file.as_mut() else {
            return;
        };
        let _ = writeln!(file, "{line}");
        let _ = file.flush();
    }

    pub fn render_report(
        &self,
        request: DiagnosticExportRequest,
    ) -> Result<String, serde_json::Error> {
        let report = DiagnosticReport {
            schema_version: 1,
            generated_at: now_millis(),
            backend_version: env!("CARGO_PKG_VERSION"),
            environment: request.environment,
            backend_log: self.snapshot(),
            frontend_log: truncate_utf8(request.frontend_log, MAX_EXPORTED_FRONTEND_LOG_BYTES),
        };
        serde_json::to_string_pretty(&report)
    }

    fn snapshot(&self) -> String {
        let Ok(_file) = self.file.lock() else {
            return String::new();
        };
        fs::read_to_string(&self.path).unwrap_or_default()
    }
}

fn open_log_file(path: &Path) -> Option<File> {
    let parent = path.parent()?;
    if fs::create_dir_all(parent).is_err() {
        return None;
    }
    if fs::metadata(path)
        .map(|metadata| metadata.len() > MAX_BACKEND_LOG_BYTES)
        .unwrap_or(false)
        && File::create(path).is_err()
    {
        return None;
    }
    OpenOptions::new().create(true).append(true).open(path).ok()
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn truncate_utf8(value: String, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value;
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_owned()
}

#[cfg(test)]
mod tests {
    use super::truncate_utf8;

    #[test]
    fn truncates_frontend_log_at_a_utf8_boundary() {
        assert_eq!(truncate_utf8("星穹铁道".to_owned(), 7), "星穹".to_owned());
    }

    #[test]
    fn keeps_short_frontend_log_unchanged() {
        assert_eq!(truncate_utf8("fps=60".to_owned(), 100), "fps=60");
    }
}
