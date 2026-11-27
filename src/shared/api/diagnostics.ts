import { invoke } from "@/shared/api/invoke";
import type { DiagnosticExportPayload } from "@/shared/diagnostics/frontend";

export interface DiagnosticLogStatus {
  backendBytes: number;
}

export const diagnosticsApi = {
  getStatus: () => invoke<DiagnosticLogStatus>("get_diagnostic_log_status"),
  clear: () => invoke<DiagnosticLogStatus>("clear_diagnostic_log"),
  export: (payload: DiagnosticExportPayload) =>
    invoke<string | null>("export_diagnostic_log", { request: payload }),
};
