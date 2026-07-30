use std::{
    fs,
    path::{Path, PathBuf},
    process,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use oar_ocr::{oarocr::OAROCRBuilder, utils::load_image};

use crate::{
    domain::{OcrImageResult, OcrModelConfig, OcrTextRegion},
    error::AppError,
};

fn required_file(path: &str) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(path);
    if path.is_file() {
        Ok(path)
    } else {
        Err(AppError::MissingFile(path.display().to_string()))
    }
}

pub fn recognize_image(
    image_path: String,
    models: OcrModelConfig,
) -> Result<OcrImageResult, AppError> {
    let image_path = required_file(&image_path)?;
    let detection_model = required_file(&models.detection_model)?;
    let recognition_model = required_file(&models.recognition_model)?;
    let character_dictionary = required_file(&models.character_dictionary)?;

    let started = Instant::now();
    let ocr = OAROCRBuilder::new(&detection_model, &recognition_model, &character_dictionary)
        .image_batch_size(1)
        .region_batch_size(16)
        .build()
        .map_err(|error| AppError::Ocr(error.to_string()))?;

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
    models: OcrModelConfig,
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
