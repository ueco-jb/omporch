import { join } from "node:path";
import { runOmp, type OmpRun } from "./omp.ts";
import { OMPBOX, up, rm } from "./ompbox.ts";
import type { Plan, Task, TaskResult } from "./types.ts";
import { validateTasks } from "./validation.ts";

const WORKER_PREAMBLE = `You are an autonomous worker in an isolated sandbox. Do ONLY the assignment below; the workspace is your working directory. Work to completion without asking questions. If the workspace contains flake.nix, run project build, test, lint, and generated code commands through nix develop -c so the pinned project toolchain and environment are active. When done, end your final message with a concise plain text summary: files changed, what you verified, and any blockers.

ASSIGNMENT:
`;
export interface WorkerRuntime {
  up: (name: string, workspace: string, dirs: string[]) => Promise<void>;
  run: (argv: string[], opts: { signal?: AbortSignal }) => Promise<OmpRun>;
  remove: (name: string) => Promise<void>;
  writeEvents: (path: string, content: string) => Promise<unknown>;
}

const DEFAULT_RUNTIME: WorkerRuntime = {
  up,
  run: (argv, opts) => runOmp(argv, opts),
  remove: (name) => rm(name, true),
  writeEvents: (path, content) => Bun.write(path, content),
};


export interface ExecuteOptions {
  workspace: string;
  runId: string;
  runDir: string;
  concurrency: number;
  model?: string;
  extraDirs: string[];
  keepWorkers: boolean;
  signal?: AbortSignal;
  log: (msg: string) => void;
  runtime?: WorkerRuntime;
}

export async function executePlan(plan: Plan, opts: ExecuteOptions): Promise<TaskResult[]> {
  validateTasks(plan.tasks);
  const { workspace, runId, runDir, concurrency, model, extraDirs, keepWorkers, log, signal } = opts;
  const runtime = opts.runtime ?? DEFAULT_RUNTIME;
  const byId = new Map<string, Task>(plan.tasks.map((t) => [t.id, t]));
  const results = new Map<string, TaskResult>();
  const remaining = new Set<string>(plan.tasks.map((t) => t.id));
  const inflight = new Set<Promise<void>>();

  const runTask = async (t: Task): Promise<void> => {
    const container = `orch-${runId}-${t.id}`;
    log(`[${t.id}] start: ${t.title}`);
    try {
      await runtime.up(container, workspace, extraDirs);
      const ompArgs = ["-p", "--mode", "json", "--auto-approve"];
      if (model) ompArgs.push("--model", model);
      ompArgs.push(WORKER_PREAMBLE + t.assignment);
      const r = await runtime.run([OMPBOX, "run", container, "--", ...ompArgs], { signal });
      await runtime.writeEvents(join(runDir, `${t.id}.jsonl`), r.events.map((e) => JSON.stringify(e)).join("\n"));
      results.set(t.id, {
        id: t.id,
        title: t.title,
        status: r.ok ? "done" : "failed",
        summary: r.finalText || r.errorText || r.stderr.trim() || "(no output)",
        costUSD: r.costUSD,
        container,
      });
    } catch (e) {
      results.set(t.id, {
        id: t.id,
        title: t.title,
        status: "failed",
        summary: e instanceof Error ? e.message : String(e),
        costUSD: 0,
        container,
      });
    } finally {
      if (!keepWorkers) {
        try {
          await runtime.remove(container);
        } catch (e) {
          const current = results.get(t.id);
          const failure = e instanceof Error ? e.message : String(e);
          results.set(t.id, {
            id: t.id,
            title: t.title,
            status: "failed",
            summary: `${current?.summary ?? ""}\ncleanup failed: ${failure}`.trim(),
            costUSD: current?.costUSD ?? 0,
            container,
          });
        }
      }
    }
    const res = results.get(t.id);
    log(`[${t.id}] ${res?.status ?? "failed"} ($${(res?.costUSD ?? 0).toFixed(4)})`);
  };

  while (remaining.size > 0 || inflight.size > 0) {
    if (signal?.aborted) {
      for (const id of [...remaining]) {
        const t = byId.get(id);
        results.set(id, { id, title: t?.title ?? id, status: "blocked", summary: "cancelled", costUSD: 0, container: "" });
        remaining.delete(id);
      }
    }
    for (const id of [...remaining]) {
      const t = byId.get(id);
      if (!t) {
        remaining.delete(id);
        continue;
      }
      const deps = t.depends_on ?? [];
      const blocked = deps.some((d) => {
        const r = results.get(d);
        return r !== undefined && r.status !== "done";
      });
      if (blocked) {
        results.set(id, { id, title: t.title, status: "blocked", summary: "skipped: a dependency did not complete", costUSD: 0, container: "" });
        remaining.delete(id);
        log(`[${id}] blocked`);
        continue;
      }
      const ready = deps.every((d) => results.get(d)?.status === "done");
      if (ready && inflight.size < concurrency) {
        remaining.delete(id);
        const p = runTask(t).finally(() => {
          inflight.delete(p);
        });
        inflight.add(p);
      }
    }

    if (inflight.size === 0 && remaining.size > 0) {
      for (const id of [...remaining]) {
        const t = byId.get(id);
        results.set(id, { id, title: t?.title ?? id, status: "blocked", summary: "skipped: unmet or cyclic dependencies", costUSD: 0, container: "" });
        remaining.delete(id);
      }
      break;
    }
    if (inflight.size > 0) await Promise.race(inflight);
  }

  return plan.tasks.map((t) => results.get(t.id)).filter((r): r is TaskResult => r !== undefined);
}
