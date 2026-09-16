export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticEnvironment {
  appVersion: string;
  platform: string;
  userAgent: string;
  language: string;
  viewport: string;
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  frameRate: number | null;
}

export interface DiagnosticExportPayload {
  environment: DiagnosticEnvironment;
  frontendLog: string;
}

const MAX_ENTRIES = 400;
const MAX_MESSAGE_LENGTH = 800;
const SENSITIVE_VALUE_PATTERN =
  /((?:["']?)(?:password|passwd|token|secret|authorization|privateKey|private_key|accessKey)(?:["']?\s*[:=]\s*))(["'][^"']*["']|[^\s,;}]+)/gi;
const AUTHENTICATED_URL_PATTERN = /(https?:\/\/)[^\s:@/]+:[^\s@/]+@/gi;

const entries: string[] = [];
let currentFrameRate: number | null = null;
let installed = false;

function nowIso() {
  return new Date().toISOString();
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(SENSITIVE_VALUE_PATTERN, "$1<redacted>")
    .replace(AUTHENTICATED_URL_PATTERN, "$1<redacted>@")
    .slice(0, MAX_MESSAGE_LENGTH);
}

function stringifyCause(cause: unknown): string {
  if (cause instanceof Error) return cause.stack ?? cause.message;
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

function append(level: DiagnosticLevel, category: string, message: string) {
  entries.push(
    JSON.stringify({
      at: nowIso(),
      level,
      category: sanitizeDiagnosticText(category),
      message: sanitizeDiagnosticText(message),
    }),
  );
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export const frontendDiagnostics = {
  record(level: DiagnosticLevel, category: string, message: string) {
    append(level, category, message);
  },

  recordIpc(command: string, elapsedMs: number, cause?: unknown) {
    const duration = Math.round(Math.max(0, elapsedMs));
    if (cause === undefined) {
      append("debug", "ipc", `${command} completed in ${duration} ms`);
    } else {
      append("error", "ipc", `${command} failed after ${duration} ms: ${stringifyCause(cause)}`);
    }
  },

  setFrameRate(value: number | null) {
    currentFrameRate = value;
  },

  snapshot() {
    return entries.join("\n");
  },

  environment(appVersion: string): DiagnosticEnvironment {
    if (typeof window === "undefined") {
      return {
        appVersion,
        platform: "unknown",
        userAgent: "unknown",
        language: "unknown",
        viewport: "unknown",
        devicePixelRatio: 1,
        hardwareConcurrency: null,
        frameRate: currentFrameRate,
      };
    }

    return {
      appVersion,
      platform: navigator.platform || "unknown",
      userAgent: navigator.userAgent || "unknown",
      language: navigator.language || "unknown",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      frameRate: currentFrameRate,
    };
  },

  exportPayload(appVersion: string): DiagnosticExportPayload {
    return {
      environment: this.environment(appVersion),
      frontendLog: this.snapshot(),
    };
  },

  install() {
    if (installed || typeof window === "undefined") return;
    installed = true;
    append("info", "lifecycle", "frontend mounted");
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
  },

  uninstall() {
    if (!installed || typeof window === "undefined") return;
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    installed = false;
  },
};

function onWindowError(event: ErrorEvent) {
  const location = event.filename ? ` (${event.filename}:${event.lineno})` : "";
  const detail = event.error instanceof Error ? `: ${stringifyCause(event.error)}` : "";
  append("error", "window", `${event.message || "uncaught error"}${detail}${location}`);
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  append("error", "promise", `unhandled rejection: ${stringifyCause(event.reason)}`);
}
