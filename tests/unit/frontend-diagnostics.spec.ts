import { frontendDiagnostics, sanitizeDiagnosticText } from "@/shared/diagnostics/frontend";

describe("frontend diagnostics", () => {
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
});
