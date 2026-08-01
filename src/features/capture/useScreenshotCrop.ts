import { computed, onBeforeUnmount, reactive, ref, type Ref } from "vue";
import { captureApi } from "@/shared/api/capture";
import { windowApi } from "@/shared/api/window";
import type { OcrModelConfig } from "@/types";

const modelConfig: OcrModelConfig = {
  detectionModel: "models/text_detection.onnx",
  recognitionModel: "models/text_recognition.onnx",
  characterDictionary: "models/character_dict.txt",
};

/** Owns the temporary screenshot, crop selection and its cleanup lifecycle. */
interface ScreenshotCropOptions {
  busy: Ref<boolean>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}

export function useScreenshotCrop({ busy, setError, setNotice }: ScreenshotCropOptions) {
  const ocrResult = ref<Awaited<ReturnType<typeof captureApi.recognizeScreenshot>> | null>(null);
  const screenshotPreviewUrl = ref<string | null>(null);
  const cropSurface = ref<HTMLElement | null>(null);
  const cropDragging = ref(false);
  const screenshotFullscreen = ref(false);
  const cropSelection = reactive({ startX: 0, startY: 0, endX: 0, endY: 0 });
  const cropBox = computed(() => ({
    left: Math.min(cropSelection.startX, cropSelection.endX),
    top: Math.min(cropSelection.startY, cropSelection.endY),
    width: Math.abs(cropSelection.endX - cropSelection.startX),
    height: Math.abs(cropSelection.endY - cropSelection.startY),
  }));
  const hasCropSelection = computed(() => cropBox.value.width >= 12 && cropBox.value.height >= 12);

  async function runOcrScreenshot() {
    busy.value = true;
    setError("");
    setNotice("正在进入框选截图模式…");
    ocrResult.value = null;
    try {
      setNotice("正在隐藏工具箱并读取当前桌面…");
      await windowApi.hide();
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      const imageBytes = await Promise.race([
        captureApi.captureDesktop(),
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () =>
              reject(
                new Error(
                  "系统截图在 8 秒内没有返回；请检查 macOS 的“屏幕录制”权限，或重新启动应用后再试。",
                ),
              ),
            8000,
          ),
        ),
      ]);
      if (!imageBytes.length) throw new Error("系统截图返回了空图片");
      const image = new Blob([new Uint8Array(imageBytes)], { type: "image/png" });
      await windowApi.show();
      screenshotPreviewUrl.value = URL.createObjectURL(image);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      setNotice("请拖拽虚线框选需要识别的区域");
      screenshotFullscreen.value = true;
      await windowApi.setFullscreen(true);
    } catch (cause) {
      await windowApi.show();
      await closeCropPicker(false);
      setError(`无法进入截图模式：${String(cause)}`);
    } finally {
      busy.value = false;
    }
  }

  function cropPoint(event: PointerEvent) {
    const bounds = cropSurface.value?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
    };
  }

  function startCropSelection(event: PointerEvent) {
    const point = cropPoint(event);
    Object.assign(cropSelection, {
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    });
    cropDragging.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function updateCropSelection(event: PointerEvent) {
    if (!cropDragging.value) return;
    const point = cropPoint(event);
    cropSelection.endX = point.x;
    cropSelection.endY = point.y;
  }

  function endCropSelection(event: PointerEvent) {
    updateCropSelection(event);
    cropDragging.value = false;
  }

  function resetCropSelection() {
    Object.assign(cropSelection, { startX: 0, startY: 0, endX: 0, endY: 0 });
  }

  async function closeCropPicker(cancelled = true) {
    if (screenshotPreviewUrl.value) URL.revokeObjectURL(screenshotPreviewUrl.value);
    screenshotPreviewUrl.value = null;
    cropDragging.value = false;
    resetCropSelection();
    if (screenshotFullscreen.value) {
      screenshotFullscreen.value = false;
      await windowApi.setFullscreen(false);
    }
    if (cancelled) setNotice("已取消截图");
  }

  async function recognizeCrop() {
    const previewUrl = screenshotPreviewUrl.value;
    const surface = cropSurface.value;
    if (!previewUrl || !surface || !hasCropSelection.value) {
      setError("请拖拽框选需要识别的区域");
      return;
    }
    busy.value = true;
    setError("");
    try {
      const source = await createImageBitmap(await (await fetch(previewUrl)).blob());
      const bounds = surface.getBoundingClientRect();
      const area = cropBox.value;
      const sourceX = Math.round(area.left * (source.width / bounds.width));
      const sourceY = Math.round(area.top * (source.height / bounds.height));
      const sourceWidth = Math.max(1, Math.round(area.width * (source.width / bounds.width)));
      const sourceHeight = Math.max(1, Math.round(area.height * (source.height / bounds.height)));
      const canvas = document.createElement("canvas");
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      canvas
        .getContext("2d")
        ?.drawImage(
          source,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight,
        );
      source.close();
      const image = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("截图裁剪失败"))),
          "image/png",
        ),
      );
      await closeCropPicker(false);
      setNotice("正在本地识别框选区域…");
      ocrResult.value = await captureApi.recognizeScreenshot(
        Array.from(new Uint8Array(await image.arrayBuffer())),
        modelConfig,
      );
      setNotice("区域已识别，临时图片已清理");
    } catch (cause) {
      setError(String(cause));
    } finally {
      busy.value = false;
    }
  }

  onBeforeUnmount(() => {
    if (screenshotPreviewUrl.value) URL.revokeObjectURL(screenshotPreviewUrl.value);
    if (screenshotFullscreen.value) void windowApi.setFullscreen(false);
  });

  return {
    ocrResult,
    screenshotPreviewUrl,
    cropSurface,
    cropDragging,
    screenshotFullscreen,
    cropBox,
    hasCropSelection,
    runOcrScreenshot,
    startCropSelection,
    updateCropSelection,
    endCropSelection,
    resetCropSelection,
    closeCropPicker,
    recognizeCrop,
  };
}
