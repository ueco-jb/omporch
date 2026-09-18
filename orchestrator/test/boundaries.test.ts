import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractResult } from "../src/omp.ts";
import { parsePlan } from "../src/plan.ts";

test("extracts the last assistant result", () => {
  const extracted = extractResult([
    {
      type: "agent_end",
      messages: [
        { role: "assistant", content: [{ type: "text", text: "first" }], usage: { cost: { total: 1 } } },
        { role: "assistant", content: [{ type: "text", text: "last" }], usage: { cost: { total: 2 } } },
      ],
    },
  ]);
  expect(extracted).toEqual({ finalText: "last", errorText: "", costUSD: 3 });
});

test("extracts the last assistant provider error", () => {
  const extracted = extractResult([
    {
      type: "agent_end",
      messages: [
        { role: "assistant", content: [], errorMessage: "configured model is unavailable", usage: { cost: { total: 0 } } },
      ],
    },
  ]);
  expect(extracted).toEqual({ finalText: "", errorText: "configured model is unavailable", costUSD: 0 });
});

test("rejects malformed planner dependencies", () => {
  expect(() =>
    parsePlan(JSON.stringify({ tasks: [{ id: "task", title: "task", assignment: "work", depends_on: [1] }] })),
  ).toThrow("invalid dependencies");
});

test("rejects agent names that escape the state root", async () => {
  const root = await mkdtemp(join(tmpdir(), "omporch-name-"));
  const home = join(root, "home");
  const state = join(home, ".ompbox");
  const sentinel = join(home, "sentinel");
  await mkdir(join(state, "agents"), { recursive: true });
  await mkdir(sentinel);
  const script = join(import.meta.dir, "..", "..", "bin", "ompbox");

  try {
    const proc = Bun.spawn([script, "rm", "../../sentinel", "--purge"], {
      env: { ...process.env, OMPBOX_HOME: state },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).not.toBe(0);
    expect((await stat(sentinel)).isDirectory()).toBeTrue();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
