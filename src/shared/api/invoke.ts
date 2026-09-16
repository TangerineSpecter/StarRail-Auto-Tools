import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { frontendDiagnostics } from "@/shared/diagnostics/frontend";

/** Centralizes IPC timing and error diagnostics without recording command arguments. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await tauriInvoke<T>(command, args);
    frontendDiagnostics.recordIpc(command, performance.now() - startedAt);
    return result;
  } catch (cause) {
    frontendDiagnostics.recordIpc(command, performance.now() - startedAt, cause);
    throw cause;
  }
}
