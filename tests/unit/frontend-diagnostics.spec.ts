import {
  formatDiagnosticBytes,
  frontendDiagnostics,
  sanitizeDiagnosticText,
} from "@/shared/diagnostics/frontend";

describe("frontend diagnostics", () => {
  beforeEach(() => {
    frontendDiagnostics.clear();
  });

  it("redacts credentials and sensitive values before exporting", () => {
    const value =
      'https://alice:secret@example.com/api password="hunter2" token: abc123 privateKey=/tmp/key';

    const sanitized = sanitizeDiagnosticText(value);

    expect(sanitized).not.toContain("secret");
    expect(sanitized).not.toContain("hunter2");
    expect(sanitized).not.toContain("abc123");
    expect(sanitized).not.toContain("/tmp/key");
    expect(sanitized).toContain("<redacted>");
  });

  it("records IPC failures without including command arguments", () => {
    frontendDiagnostics.recordIpc("save_sync_settings", 123, "password=secret");

    const log = frontendDiagnostics.snapshot();
    expect(log).toContain("save_sync_settings failed after 123 ms");
    expect(log).not.toContain("secret");
  });

  it("measures UTF-8 byte length and clears buffered entries", () => {
    expect(frontendDiagnostics.byteLength()).toBe(0);

    frontendDiagnostics.record("info", "diagnostics", "星穹铁道日志");
    const byteLength = frontendDiagnostics.byteLength();
    expect(byteLength).toBeGreaterThan(frontendDiagnostics.snapshot().length);

    frontendDiagnostics.clear();
    expect(frontendDiagnostics.snapshot()).toBe("");
    expect(frontendDiagnostics.byteLength()).toBe(0);
  });

  it("formats diagnostic byte sizes across B, KB, MB, and invalid values", () => {
    expect(formatDiagnosticBytes(0)).toBe("0 B");
    expect(formatDiagnosticBytes(-10)).toBe("0 B");
    expect(formatDiagnosticBytes(Number.NaN)).toBe("0 B");
    expect(formatDiagnosticBytes(512)).toBe("512 B");
    expect(formatDiagnosticBytes(1536)).toBe("1.5 KB");
    expect(formatDiagnosticBytes(1024 * 1024 * 2.25)).toBe("2.3 MB");
  });
});
