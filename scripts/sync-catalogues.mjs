#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import { mkdtemp, mkdir, readdir, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { publishCatalogueBatch } from "./lib/catalogue-publication.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const catalogueTasks = [
  { id: "relic", name: "遗器与角色基础图鉴", script: "sync-relic-catalog.mjs", images: true },
  { id: "light-cone", name: "光锥图鉴", script: "sync-light-cone-catalog.mjs", images: true },
  {
    id: "mechanic",
    name: "全量技能与机制来源",
    script: "sync-mechanic-catalogue.mjs",
    images: false,
  },
  {
    id: "mechanisms",
    name: "全量条款拆解与近似配置",
    script: "compile-mechanisms.mjs",
    images: false,
  },
];

export function catalogueSyncPlan(args = []) {
  const flags = args.filter((arg) => arg.startsWith("--"));
  for (const flag of flags)
    if (!["--skip-images", "--refresh-images"].includes(flag))
      throw new Error(`不支持的参数：${flag}（使用 --help 查看用法）`);
  if (flags.includes("--skip-images") && flags.includes("--refresh-images"))
    throw new Error("--skip-images 与 --refresh-images 不能同时使用");
  const selected = args.filter((arg) => !arg.startsWith("--"));
  for (const id of selected)
    if (id !== "all" && !catalogueTasks.some((task) => task.id === id))
      throw new Error(`未知同步任务：${id}`);
  const all = !selected.length || selected.includes("all");
  return catalogueTasks
    .filter((task) => all || selected.includes(task.id))
    .map((task) => ({ ...task, args: task.images ? [...new Set(flags)] : [] }));
}

function runTask(task, candidateRoot) {
  return new Promise((resolveTask, reject) => {
    const child = spawn(process.execPath, [resolve(root, "scripts", task.script), ...task.args], {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, CATALOGUE_CANDIDATE_ROOT: candidateRoot },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveTask();
      else
        reject(
          new Error(
            `${task.name}失败（${signal ? `信号 ${signal}` : `退出码 ${code}`}），后续任务未执行。`,
          ),
        );
    });
  });
}

export async function synchronizeCatalogues(plan, execute = runTask, log = console.log) {
  return synchronizeCandidateBatch(plan, execute, log);
}

/** JSON tasks read/write an isolated candidate tree; only a successful batch is published. */
export async function synchronizeCandidateBatch(
  plan,
  execute,
  log = console.log,
  projectRoot = root,
) {
  const stagingRoot = await mkdtemp(resolve(tmpdir(), "hsr-catalogue-candidate-"));
  const dataPath = resolve(projectRoot, "src/data");
  const candidatePath = resolve(stagingRoot, "src/data");
  try {
    await mkdir(candidatePath, { recursive: true });
    const names = (await readdir(dataPath)).filter((name) => name.endsWith(".json"));
    const snapshots = new Map();
    for (const name of names) {
      await copyFile(resolve(dataPath, name), resolve(candidatePath, name));
      snapshots.set(name, await readFile(resolve(candidatePath, name), "utf8"));
    }
    for (const [index, task] of plan.entries()) {
      log(`[${index + 1}/${plan.length}] 生成候选：${task.name}…`);
      await execute(task, stagingRoot);
    }
    const entries = [];
    for (const name of (await readdir(candidatePath)).filter((name) => name.endsWith(".json"))) {
      const bytes = await readFile(resolve(candidatePath, name), "utf8");
      const snapshot = snapshots.get(name) ?? null;
      // A task must actually change the candidate before it can become a publication target.
      if (bytes === snapshot) continue;
      const data = JSON.parse(bytes);
      let original = null;
      try {
        original = await readFile(resolve(dataPath, name), "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (original === bytes) continue;
      if (original !== snapshot)
        throw new Error(`同步发布冲突：${name} 在同步期间发生修改，候选未发布。`);
      entries.push({ path: resolve(dataPath, name), data });
    }
    await publishCatalogueBatch(entries);
    log(
      `同步完成：同批发布 ${entries.length} 个 JSON；图片不属于 JSON 事务，精确审核记录未自动续审。`,
    );
  } finally {
    // This exact directory was created above exclusively for this run.
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("--list")) {
    console.log(
      "用法：npm run sync:catalog -- [all | relic | light-cone | mechanic | mechanisms] [--skip-images | --refresh-images]\n不指定任务时执行全部；可同时选择多个任务，按依赖顺序串行执行。",
    );
    for (const task of catalogueTasks) console.log(`  ${task.id}: ${task.name}`);
    console.log(
      "JSON 先生成候选，全部成功后同批发布；失败保留旧版本。图片不计入事务；不保证跨进程崩溃原子性。精确机制审核另执行 npm run validate:mechanic-catalog。",
    );
    return;
  }
  await synchronizeCatalogues(catalogueSyncPlan(args));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
