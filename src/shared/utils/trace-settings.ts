export type DisabledTraceNodes = Record<string, number[]>;

export const traceSettingsStorageKey = "starrail-auto-tools.trace-disabled.v1";

export function loadDisabledTraceNodes(): DisabledTraceNodes {
  try {
    const saved = window.localStorage.getItem(traceSettingsStorageKey);
    const parsed = saved ? JSON.parse(saved) : {};
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function traceNodeEnabled(
  disabledTraceNodes: DisabledTraceNodes,
  characterId: number,
  traceId: number,
): boolean {
  return !disabledTraceNodes[String(characterId)]?.includes(traceId);
}
