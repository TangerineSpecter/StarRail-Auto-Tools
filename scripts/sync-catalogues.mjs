#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";

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

function runTask(task) {
  return new Promise((resolveTask, reject) => {
    const child = spawn(process.execPath, [resolve(root, "scripts", task.script), ...task.args], {
      cwd: root,
      stdio: "inherit",
      shell: false,
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
  for (const [index, task] of plan.entries()) {
    log(`[${index + 1}/${plan.length}] 同步${task.name}…`);
    await execute(task);
  }
  log(`同步完成：${plan.map((task) => task.name).join("、")}。人工审核记录未自动更新。`);
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("--list")) {
    console.log(
      "用法：npm run sync:catalog -- [all | relic | light-cone | mechanic] [--skip-images | --refresh-images]\n不指定任务时执行全部；可同时选择多个任务，按依赖顺序串行执行。",
    );
    for (const task of catalogueTasks) console.log(`  ${task.id}: ${task.name}`);
    console.log(
      "任一任务失败立即停止；此前已成功任务的数据不会整体回滚。机制审核另执行 npm run validate:mechanic-catalog。",
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
