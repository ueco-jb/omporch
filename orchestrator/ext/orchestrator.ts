import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { executePlan } from "../src/execute.ts";
import type { Task } from "../src/types.ts";
import { parseExtraDirs, resolveExtraDirs } from "../src/mounts.ts";
import { validateTasks } from "../src/validation.ts";

export default function orchestrator(pi: ExtensionAPI) {
  pi.setLabel("omporch");
  const z = pi.zod;

  pi.registerTool({
    name: "dispatch",
    label: "Dispatch agents",
    description: "Run tasks as isolated agents over the workspace. Independent tasks run in parallel. Use depends_on to sequence tasks. Each worker sees only its own complete assignment and the workspace files. Returns each task status and summary.",
    parameters: z.object({
      tasks: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,31})$/).describe("unique task id"),
            title: z.string().describe("short title"),
            assignment: z.string().describe("complete instructions with acceptance criteria"),
            depends_on: z.array(z.string()).optional().describe("task ids that must finish first"),
          }),
        )
        .min(1)
        .describe("tasks to run as worker agents"),
      concurrency: z.number().int().min(1).optional().describe("maximum workers in parallel"),
      model: z.string().optional().describe("model for workers"),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const workspace = process.env.OMPORCH_WORKSPACE ?? ctx.cwd;
      const extraDirs = await resolveExtraDirs(parseExtraDirs(process.env.OMPORCH_EXTRA_DIRS), workspace);
      const concurrency = params.concurrency ?? (Number(process.env.OMPORCH_CONCURRENCY ?? "4") || 4);
      const keepWorkers = process.env.OMPORCH_KEEP_WORKERS === "1";
      const model = params.model ?? process.env.OMPORCH_MODEL;

      const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      const runId = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
      const ompboxHome = process.env.OMPBOX_HOME ?? join(homedir(), ".ompbox");
      const runDir = join(ompboxHome, "runs", runId);
      await mkdir(runDir, { recursive: true });

      const tasks: Task[] = params.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        assignment: t.assignment,
        depends_on: t.depends_on,
      }));
      validateTasks(tasks);
      onUpdate?.({ content: [{ type: "text", text: `dispatching ${tasks.length} task(s) over ${workspace}` }] });

      const results = await executePlan(
        { tasks },
        {
          workspace,
          runId,
          runDir,
          concurrency,
          extraDirs,
          model,
          keepWorkers,
          signal,
          log: (m) => onUpdate?.({ content: [{ type: "text", text: m }] }),
        },
      );
      await Bun.write(join(runDir, "results.json"), JSON.stringify(results, null, 2));

      const totalCost = results.reduce((s, r) => s + r.costUSD, 0);
      const blocks = results.map(
        (r) => `## ${r.title} (${r.id}) - ${r.status}  [$${r.costUSD.toFixed(4)}]\n\n${r.summary}`,
      );
      const text = `dispatched ${results.length} task(s) | run ${runId} | cost ~$${totalCost.toFixed(4)}\n\n${blocks.join("\n\n")}`;
      return { content: [{ type: "text", text }], details: { runId, runDir, results } };
    },
  });
}
