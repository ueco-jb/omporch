import { runOmp } from "./omp.ts";
import type { Plan, Task } from "./types.ts";
import { validateTasks } from "./validation.ts";

const PLANNER_RULES = `You are the PLANNING stage of a coding agent orchestrator.

Decompose the user's request into a minimal set of concrete tasks. Each task is executed by a SEPARATE autonomous coding agent running in its own isolated sandbox over the same workspace. A worker sees ONLY its own assignment text and the workspace files. It does NOT see the original request, the other tasks, or this plan. Every assignment must therefore contain all required context.

Guidelines:
- Prefer few, independent tasks that can run in parallel. Add depends_on only when a task genuinely needs another task's output.
- Do not let two parallel tasks edit the same files. If they must touch the same files, sequence them with depends_on.
- Each assignment names the exact files or areas, the change to make, and concrete acceptance criteria. No vague "improve X".
- Do not add separate verification or formatting tasks unless asked.
- ids are unique lowercase values with words separated by dashes.

Output ONLY a JSON object, with no markdown fences and no prose, of the form:
{"rationale":"one short paragraph","tasks":[{"id":"task-id","title":"short title","assignment":"complete instructions with acceptance criteria","depends_on":["task-id"]}]}`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toTask(v: unknown): Task {
  if (!isRecord(v) || typeof v.id !== "string" || typeof v.assignment !== "string") {
    throw new Error(`task missing id or assignment: ${JSON.stringify(v).slice(0, 200)}`);
  }
  if (
    v.depends_on !== undefined &&
    (!Array.isArray(v.depends_on) || v.depends_on.some((dependency) => typeof dependency !== "string"))
  ) {
    throw new Error(`task '${v.id}' has invalid dependencies`);
  }
  return {
    id: v.id,
    title: typeof v.title === "string" ? v.title : v.id,
    assignment: v.assignment,
    depends_on: v.depends_on as string[] | undefined,
  };
}

export function parsePlan(text: string): Plan {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const fenced = fence?.[1];
  if (fenced !== undefined) s = fenced.trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    throw new Error(`planner did not return valid JSON. First 500 chars:\n${text.slice(0, 500)}`);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error("plan has no tasks");
  }
  const tasks = parsed.tasks.map(toTask);
  validateTasks(tasks);
  return { rationale: typeof parsed.rationale === "string" ? parsed.rationale : undefined, tasks };
}

export async function buildPlan(request: string, workspace: string, model?: string, directives = ""): Promise<Plan> {
  const argv = [
    "omp",
    "-p",
    "--mode",
    "json",
    "--auto-approve",
    "--no-tools",
    "--no-extensions",
    "--no-skills",
    "--no-session",
    "--cwd",
    workspace,
  ];
  if (model) argv.push("--model", model);
  const append = directives ? `${PLANNER_RULES}\n\n# Standing directives\n${directives}` : PLANNER_RULES;
  argv.push("--append-system-prompt", append);
  argv.push(`Decompose this request into tasks for the workspace at ${workspace}:\n\n${request}`);
  const r = await runOmp(argv, { cwd: workspace });
  if (!r.ok) throw new Error(`planner failed (exit ${r.exitCode}): ${r.errorText || r.stderr.trim() || "no output"}`);
  return parsePlan(r.finalText);
}
