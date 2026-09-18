import { runOmp } from "./omp.ts";
import type { TaskResult } from "./types.ts";

export async function synthesize(
  request: string,
  results: TaskResult[],
  opts: { workspace: string; model?: string; directives?: string },
): Promise<string> {
  const body = results.map((r) => `### ${r.title} (${r.id}) - ${r.status}\n\n${r.summary}`).join("\n\n");
  const prompt = `You are the REPORTING stage of a coding agent orchestrator. Write a concise final report in Markdown using ASCII for the user's original request. Synthesize the worker results below. Cover what was accomplished, each task status, anything that failed or is blocked, and concrete next steps. Be terse and factual. Do not invent results that are not present in the worker outputs.

ORIGINAL REQUEST:
${request}

WORKER RESULTS:
${body}`;
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
    opts.workspace,
  ];
  if (opts.model) argv.push("--model", opts.model);
  if (opts.directives) argv.push("--append-system-prompt", opts.directives);
  argv.push(prompt);
  const r = await runOmp(argv, { cwd: opts.workspace });
  return r.finalText || body;
}
