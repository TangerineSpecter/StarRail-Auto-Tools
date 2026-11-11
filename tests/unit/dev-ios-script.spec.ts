// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
let project: string;
const children: ChildProcess[] = [];

async function executable(path: string, source: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!/bin/bash\n${source}\n`, { mode: 0o755 });
}

beforeEach(async () => {
  project = await realpath(await mkdtemp(join(tmpdir(), "starrail-ios-dev-")));
  await copyFile(join(root, "dev-ios.sh"), join(project, "dev-ios.sh"));
  const bin = join(project, "bin");
  await executable(
    join(bin, "xcrun"),
    `case "$2" in
  list) printf '%s\\n' "$MOCK_DEVICES" ;;
  bootstatus) printf 'boot %s\\n' "$3" >> "$MOCK_LOG" ;;
  get_app_container) [ "$MOCK_APP_MISSING" != 1 ] ;;
  launch) printf 'launch %s\\n' "$*" >> "$MOCK_LOG" ;;
  *) exit 1 ;;
esac`,
  );
  await executable(join(bin, "open"), `printf 'open %s\\n' "$*" >> "$MOCK_LOG"`);
  await executable(
    join(bin, "lsof"),
    `if [[ "$*" == *"-d cwd"* ]]; then
  if [ "$MOCK_OCCUPANT" = self ]; then
    printf 'p1234\\nfcwd\\nn%s\\n' "$MOCK_PROJECT"
  else
    printf 'p1234\\nfcwd\\nn/other-project\\n'
  fi
elif [ -n "$MOCK_OCCUPANT" ]; then
  echo 1234
else
  exit 1
fi`,
  );
  await executable(join(bin, "ps"), `echo 'node /somewhere/vite --mode mobile'`);
  await executable(
    join(bin, "curl"),
    `if [ -n "$MOCK_OCCUPANT" ] || [ -f "$MOCK_READY" ]; then
  echo '<script src="/@vite/client"></script><script src="/src/mobile/main.ts"></script>'
else
  exit 7
fi`,
  );
  await executable(
    join(project, "node_modules/.bin/vite"),
    `printf 'vite %s\\n' "$*" >> "$MOCK_LOG"
touch "$MOCK_READY"
trap 'printf "vite stopped\\n" >> "$MOCK_LOG"; rm -f "$MOCK_READY"; exit 0' TERM INT
while true; do sleep 0.1; done`,
  );
});

afterEach(async () => {
  await Promise.all(
    children.splice(0).map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once("close", () => resolve());
          if (!child.kill("SIGTERM")) resolve();
        }),
    ),
  );
  await rm(project, { recursive: true, force: true });
});

function startScript(extraEnv: Record<string, string> = {}) {
  const child = spawn("/bin/bash", [join(project, "dev-ios.sh")], {
    cwd: tmpdir(),
    env: {
      ...process.env,
      PATH: `${join(project, "bin")}:${process.env.PATH}`,
      NVM_DIR: join(project, "no-nvm"),
      MOCK_PROJECT: project,
      MOCK_LOG: join(project, "calls.log"),
      MOCK_READY: join(project, "ready"),
      MOCK_DEVICES: JSON.stringify({
        devices: { ios: [{ name: "iPhone Duo", udid: "SIM-1", state: "Booted" }] },
      }),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk.toString()));
  child.stderr.on("data", (chunk) => (output += chunk.toString()));
  const finished = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { child, finished, output: () => output };
}

async function calls() {
  return readFile(join(project, "calls.log"), "utf8").catch(() => "");
}

describe("iOS simulator development script", () => {
  it("starts the mobile server, opens the app, and stops its server on exit", async () => {
    const run = startScript();
    for (let attempt = 0; attempt < 150 && !run.output().includes("应用已启动"); attempt++) {
      if (run.child.exitCode !== null) throw new Error(run.output());
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(run.output()).toContain("应用已启动");
    expect(await calls()).toContain("vite --mode mobile --host 127.0.0.1 --port 1432 --strictPort");
    expect(await calls()).toContain("launch simctl launch --terminate-running-process SIM-1");

    run.child.kill("SIGTERM");
    expect(await run.finished).toBe(143);
    expect(await calls()).toContain("vite stopped");
  });

  it("reuses an existing mobile server from this checkout", async () => {
    const run = startScript({ MOCK_OCCUPANT: "self" });
    expect(await run.finished).toBe(0);
    expect(run.output()).toContain("正在复用");
    expect(await calls()).toContain("launch simctl launch");
    expect(await calls()).not.toContain("vite --mode");
  });

  it("does not launch or stop an unrelated server occupying the port", async () => {
    const run = startScript({ MOCK_OCCUPANT: "other" });
    expect(await run.finished).toBe(1);
    expect(run.output()).toContain("端口 1432 已被其他进程占用");
    expect(await calls()).not.toContain("launch simctl launch");
    expect(await calls()).not.toContain("vite --mode");
  });

  it("reports a missing app before starting the server", async () => {
    const run = startScript({ MOCK_APP_MISSING: "1" });
    expect(await run.finished).toBe(1);
    expect(run.output()).toContain("模拟器中未安装");
    expect(await calls()).not.toContain("vite --mode");
  });

  it("boots the available Duo when no simulator is running", async () => {
    const run = startScript({
      MOCK_OCCUPANT: "self",
      MOCK_DEVICES: JSON.stringify({
        devices: { ios: [{ name: "iPhone Duo", udid: "SIM-1", state: "Shutdown" }] },
      }),
    });
    expect(await run.finished).toBe(0);
    expect(await calls()).toContain("boot SIM-1");
    expect(await calls()).toContain("launch simctl launch");
  });
});
