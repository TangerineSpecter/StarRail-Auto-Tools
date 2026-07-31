import { invoke } from "@tauri-apps/api/core";
import type { OcrImageResult, OcrModelConfig } from "@/types";

export const captureApi = {
  recognizeImage: (imagePath: string, models: OcrModelConfig) =>
    invoke<OcrImageResult>("recognize_image", { imagePath, models }),
  recognizeScreenshot: (imageBytes: number[], models: OcrModelConfig) =>
    invoke<OcrImageResult>("recognize_screenshot", { imageBytes, models }),
  captureDesktop: () => invoke<number[]>("capture_desktop"),
};
