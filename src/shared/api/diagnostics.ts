import { invoke } from "@/shared/api/invoke";
import type { DiagnosticExportPayload } from "@/shared/diagnostics/frontend";

export const diagnosticsApi = {
  export: (payload: DiagnosticExportPayload) =>
    invoke<string | null>("export_diagnostic_log", { request: payload }),
};
