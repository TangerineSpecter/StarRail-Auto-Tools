// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtures: string[] = [];
afterEach(() => fixtures.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "starrail ios build "));
  fixtures.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
  mkdirSync(join(dir, "src-tauri/gen/apple/starrail-auto-tools.xcodeproj"), { recursive: true });
  copyFileSync(join(process.cwd(), "build-ios.sh"), join(dir, "build-ios.sh"));
  const command = (name: string, body: string) =>
    writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  command("uname", 'echo "${STARRAIL_TEST_OS:-Darwin}"');
  command("xcodebuild", "echo 'Xcode test'");
  command("xcrun", "exit 0");
  command("cargo", "exit 0");
  command("rustup", 'echo "${STARRAIL_TEST_TARGET:-aarch64-apple-ios}"');
  command("npm", 'printf "%s\\n" "$@" >> "$STARRAIL_TEST_ARGS"\nexit "${STARRAIL_TEST_EXIT:-0}"');
  symlinkSync(process.execPath, join(bin, "node"));
  writeFileSync(join(dir, "node_modules/.bin/tauri"), "", { mode: 0o755 });
  const argsFile = join(dir, "npm-args");
  const run = (args: string[] = [], env: Record<string, string> = {}) =>
    spawnSync("/bin/bash", [join(dir, "build-ios.sh"), ...args], {
      cwd: tmpdir(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:/usr/bin:/bin`,
        NVM_DIR: dir,
        STARRAIL_TEST_ARGS: argsFile,
        ...env,
      },
    });
  return { dir, argsFile, run };
}

describe.skipIf(process.platform === "win32")("personal iPhone build entry point", () => {
  it("prepares a signed physical-device build from outside the project directory", () => {
    const f = fixture();
    const result = f.run();
    expect(result.status).toBe(0);
    expect(readFileSync(f.argsFile, "utf8").trim().split("\n")).toEqual([
      "run",
      "tauri",
      "--",
      "ios",
      "build",
      "--target",
      "aarch64",
      "--open",
      "--export-method",
      "debugging",
      "--config",
      "src-tauri/tauri.ios.conf.json",
    ]);
    expect(existsSync(join(f.dir, "src-tauri/gen/apple/starrail-auto-tools.xcodeproj"))).toBe(true);
  });

  it("checks without launching Xcode or installing dependencies", () => {
    const f = fixture();
    expect(f.run(["--check"]).status).toBe(0);
    expect(existsSync(f.argsFile)).toBe(false);
    rmSync(join(f.dir, "node_modules"), { recursive: true });
    expect(f.run(["--check"]).status).toBe(1);
    expect(existsSync(f.argsFile)).toBe(false);
  });

  it("stops on unsupported systems or missing physical-device targets", () => {
    const f = fixture();
    expect(f.run([], { STARRAIL_TEST_OS: "Linux" }).status).toBe(1);
    expect(f.run([], { STARRAIL_TEST_TARGET: "aarch64-apple-ios-sim" }).status).toBe(1);
    expect(existsSync(f.argsFile)).toBe(false);
  });

  it("rejects flags that could switch this workflow to an unsigned build", () => {
    const f = fixture();
    expect(f.run(["--no-sign"]).status).toBe(1);
    expect(existsSync(f.argsFile)).toBe(false);
  });

  it("preserves a failing build exit status", () => {
    const f = fixture();
    expect(f.run([], { STARRAIL_TEST_EXIT: "42" }).status).toBe(42);
  });
});
