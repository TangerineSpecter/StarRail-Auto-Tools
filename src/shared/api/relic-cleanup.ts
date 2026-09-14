import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  CleanupProgress,
  CleanupCapabilities,
  CleanupQueueItem,
  CleanupRunDetail,
  CleanupRunSummary,
  OcrModelStatus,
} from "@/types";

const candidateRequest = (itemIds: number[]) => ({ itemIds });

export const relicCleanupApi = {
  capabilities: () => invoke<CleanupCapabilities>("get_cleanup_capabilities"),
  addCandidates: (itemIds: number[]) =>
    invoke<CleanupQueueItem[]>("add_cleanup_candidates", {
      request: candidateRequest(itemIds),
    }),
  removeCandidates: (itemIds: number[]) =>
    invoke<number>("remove_cleanup_candidates", { request: candidateRequest(itemIds) }),
  listQueue: () => invoke<CleanupQueueItem[]>("list_cleanup_queue"),
  listRuns: () => invoke<CleanupRunSummary[]>("list_cleanup_runs"),
  runDetail: (runId: number) => invoke<CleanupRunDetail>("get_cleanup_run", { runId }),
  startPreview: () => invoke<CleanupRunSummary>("start_cleanup_preview"),
  startExecution: (runId: number) => invoke<CleanupRunDetail>("start_cleanup_execution", { runId }),
  cancel: () => invoke<void>("cancel_cleanup_task"),
  openRunDirectory: (runId: number) => invoke<void>("open_cleanup_run_directory", { runId }),
  deleteRun: (runId: number) => invoke<void>("delete_cleanup_run", { runId }),
  modelStatus: () => invoke<OcrModelStatus>("get_ocr_model_status"),
  downloadModel: () => invoke<OcrModelStatus>("download_ocr_model"),
  cancelModelDownload: () => invoke<OcrModelStatus>("cancel_ocr_model_download"),
  verifyModel: () => invoke<OcrModelStatus>("verify_ocr_model"),
  deleteModel: () => invoke<OcrModelStatus>("delete_ocr_model_cache"),
  onProgress: (handler: (progress: CleanupProgress) => void) =>
    listen<CleanupProgress>("relic-cleanup://progress", (event) => handler(event.payload)),
  onModelProgress: (handler: (status: OcrModelStatus) => void) =>
    listen<OcrModelStatus>("ocr-model://progress", (event) => handler(event.payload)),
  fileUrl: (directory: string, relativePath: string) => {
    const separator = directory.includes("\\") ? "\\" : "/";
    return convertFileSrc(`${directory}${separator}${relativePath.replaceAll("/", separator)}`);
  },
};
