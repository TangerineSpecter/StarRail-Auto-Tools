export function formatTime(value: number | null): string {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export const formatBaseStat = (value: number): number => Math.floor(value + 1e-6);

export const formatTraceStat = (value: number): string =>
  Math.abs(value) < 1 ? `+${(value * 100).toFixed(1).replace(/\.0$/, "")}%` : `+${value}`;
