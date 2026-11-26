export function extractGameVersion(protocolVersion?: string | null): string {
  if (!protocolVersion) return "";
  return protocolVersion.match(/HSR-(\d+(?:\.\d+)*)/i)?.[1] ?? "";
}

export function normalizeGameVersion(version?: string | null): string {
  if (!version) return "";
  return version
    .trim()
    .replace(/^[vV]+/, "")
    .trim();
}

export function formatPlanVersionTag(version?: string | null): string {
  const normalized = normalizeGameVersion(version);
  return normalized ? `v${normalized}` : "";
}

export function compareGameVersions(left: string, right: string): number {
  const leftParts = normalizeGameVersion(left)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const rightParts = normalizeGameVersion(right)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const maxLen = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLen; index += 1) {
    const a = Number.isFinite(leftParts[index]) ? leftParts[index]! : 0;
    const b = Number.isFinite(rightParts[index]) ? rightParts[index]! : 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

export function isBuildPlanOutdated(
  planGameVersion?: string | null,
  currentGameVersion?: string | null,
): boolean {
  const recorded = normalizeGameVersion(planGameVersion);
  const current = normalizeGameVersion(currentGameVersion);
  if (!recorded || !current) return false;
  return compareGameVersions(recorded, current) < 0;
}

function normalizeEpochMillis(timestamp?: number | null): number | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp < 1e11 ? timestamp * 1000 : timestamp;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatPlanUpdatedDate(timestamp?: number | null): string {
  const millis = normalizeEpochMillis(timestamp);
  if (millis === null) return "";
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatPlanUpdatedDateTime(timestamp?: number | null): string {
  const millis = normalizeEpochMillis(timestamp);
  if (millis === null) return "";
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
