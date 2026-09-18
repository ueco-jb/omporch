import { expect, test } from "bun:test";
import { executePlan, type WorkerRuntime } from "../src/execute.ts";
import type { OmpRun } from "../src/omp.ts";
import type { Plan } from "../src/types.ts";

function result(ok: boolean): OmpRun {
  return {
    finalText: ok ? "done" : "",
    costUSD: 0,
    exitCode: ok ? 0 : 1,
    ok,
    stderr: ok ? "" : "failed",
    events: [],
  };
}

function options(runtime: WorkerRuntime, signal?: AbortSignal) {
  return {
    workspace: "/workspace",
    runId: "20260918000000-test",
    runDir: "/run",
    concurrency: 2,
    extraDirs: [],
    keepWorkers: false,
    signal,
    log: () => {},
    runtime,
  };
}

test("blocks dependents and cleans every started worker", async () => {
  const started: string[] = [];
  const removed: string[] = [];
  const runtime: WorkerRuntime = {
    up: async (name) => {
      started.push(name);
    },
    run: async (argv) => result(!argv.at(-1)?.includes("fail")),
    remove: async (name) => {
      removed.push(name);
    },
    writeEvents: async () => {},
  };
  const plan: Plan = {
    tasks: [
      { id: "root", title: "root", assignment: "fail" },
      { id: "child", title: "child", assignment: "done", depends_on: ["root"] },
      { id: "solo", title: "solo", assignment: "done" },
    ],
  };

  const results = await executePlan(plan, options(runtime));
  expect(results.map(({ id, status }) => ({ id, status }))).toEqual([
    { id: "root", status: "failed" },
    { id: "child", status: "blocked" },
    { id: "solo", status: "done" },
  ]);
  expect(started.some((name) => name.endsWith("-child"))).toBeFalse();
  expect(removed.sort()).toEqual(started.sort());
});

test("cleans a worker when execution throws", async () => {
  const removed: string[] = [];
  const runtime: WorkerRuntime = {
    up: async () => {},
    run: async () => {
      throw new Error("run failed");
    },
    remove: async (name) => {
      removed.push(name);
    },
    writeEvents: async () => {},
  };
  const plan: Plan = { tasks: [{ id: "root", title: "root", assignment: "run" }] };

  const results = await executePlan(plan, options(runtime));
  expect(results[0]?.status).toBe("failed");
  expect(removed).toHaveLength(1);
});

test("aborts active execution and cleans its worker", async () => {
  const controller = new AbortController();
  let startRun: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    startRun = resolve;
  });
  const removed: string[] = [];
  const runtime: WorkerRuntime = {
    up: async () => {},
    run: async (_argv, { signal }) =>
      new Promise<OmpRun>((_resolve, reject) => {
        startRun?.();
        if (signal?.aborted) reject(new Error("cancelled"));
        signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      }),
    remove: async (name) => {
      removed.push(name);
    },
    writeEvents: async () => {},
  };
  const plan: Plan = { tasks: [{ id: "root", title: "root", assignment: "run" }] };

  const execution = executePlan(plan, options(runtime, controller.signal));
  await began;
  controller.abort();
  const results = await execution;
  expect(results[0]?.status).toBe("failed");
  expect(removed).toHaveLength(1);
});
