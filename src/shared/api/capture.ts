import { invoke } from "@/shared/api/invoke";
import type { OcrImageResult } from "@/types";

export const captureApi = {
  recognizeImage: (imagePath: string) => invoke<OcrImageResult>("recognize_image", { imagePath }),
  recognizeScreenshot: (imageBytes: number[]) =>
    invoke<OcrImageResult>("recognize_screenshot", { imageBytes }),
  captureDesktop: () => invoke<number[]>("capture_desktop"),
};
