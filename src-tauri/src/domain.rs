use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCapabilities {
    pub platform: String,
    pub window_capture: bool,
    pub local_ocr: bool,
    pub note: String,
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
