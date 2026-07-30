use std::{
    path::{Path, PathBuf},
    time::Instant,
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
