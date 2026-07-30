use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCapabilities {
    pub platform: String,
    pub window_capture: bool,
    pub local_ocr: bool,
    pub note: String,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum ScanPhase {
    #[default]
    Idle,
    Scanning,
    Paused,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSnapshot {
    pub phase: ScanPhase,
    pub target_window: Option<String>,
    pub interval_ms: u64,
    pub frames_seen: u64,
    pub frames_analyzed: u64,
    pub items_recorded: u64,
    pub last_message: String,
}

impl Default for ScanSnapshot {
    fn default() -> Self {
        Self {
            phase: ScanPhase::Idle,
            target_window: None,
            interval_ms: 750,
            frames_seen: 0,
            frames_analyzed: 0,
            items_recorded: 0,
            last_message: "等待开始扫描".to_owned(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartScanRequest {
    pub target_window: String,
    pub interval_ms: u64,
    pub change_threshold: f32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrModelConfig {
    pub detection_model: String,
    pub recognition_model: String,
    pub character_dictionary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrTextRegion {
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrImageResult {
    pub image_path: String,
    pub regions: Vec<OcrTextRegion>,
    pub elapsed_ms: u128,
}
