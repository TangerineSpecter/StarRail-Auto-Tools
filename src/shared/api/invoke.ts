import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { frontendDiagnostics } from "@/shared/diagnostics/frontend";

type DevelopmentInvokeHandler = (
  command: string,
  args?: Record<string, unknown>,
) => { value: unknown } | undefined;
let developmentHandler: DevelopmentInvokeHandler | undefined;

/** Installed only by the mobile development entry; production always uses native IPC. */
export function setDevelopmentInvokeHandler(handler: DevelopmentInvokeHandler) {
  if (import.meta.env.DEV) developmentHandler = handler;
}

/** Centralizes IPC timing and error diagnostics without recording command arguments. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const startedAt = performance.now();
  try {
    const mocked = import.meta.env.DEV ? developmentHandler?.(command, args) : undefined;
    const result = mocked ? (mocked.value as T) : await tauriInvoke<T>(command, args);
    frontendDiagnostics.recordIpc(command, performance.now() - startedAt);
    return result;
  } catch (cause) {
    frontendDiagnostics.recordIpc(command, performance.now() - startedAt, cause);
    throw cause;
  }
}
