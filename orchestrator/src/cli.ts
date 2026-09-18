#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, realpath } from "node:fs/promises";
import { buildPlan } from "./plan.ts";
import { executePlan } from "./execute.ts";
import { synthesize } from "./report.ts";
import { loadDirectives } from "./directives.ts";
import { toAscii } from "./util.ts";
import { resolveExtraDirs } from "./mounts.ts";

const USAGE = `usage:
  omporch chat -w <workspace> [--model M] [--worker-model M] [-c N] [--keep-workers] [--new] [--allow-dir DIR]
      interactive: talk to the orchestrator and dispatch sandboxed workers
  omporch run "<request>" -w <workspace> [--yes] [-c N] [--model M] [--keep-workers] [--allow-dir DIR]
      single run: plan, approve, run workers, and print a report

options:
  -w, --workspace <dir>   workspace mounted into every worker
  -y, --yes               run without the plan approval gate
      --keep-workers      retain worker containers after completion
  -c, --concurrency <n>   maximum workers in parallel
      --model <m>         planner and worker model for run, orchestrator model for chat
      --worker-model <m>  worker model for chat
      --allow-dir <dir>   extra directory mounted as read only, repeatable
      --new               start a fresh chat session`;

const ORCHESTRATOR_ROLE = `You are an ORCHESTRATOR. Your job is to DELEGATE, not to do the work yourself. By default EVERY task, including investigation, analysis, code changes, builds, and tests, is carried out by sandboxed worker agents you spawn with the \`dispatch\` tool. Dispatching is your primary action and your default reflex, not a fallback.

Conversation: discuss the request and ask clarifying questions when the goal or scope is genuinely ambiguous. Once you understand the task, dispatch it. Do not start doing it yourself.

Your local tools are for quick scoping only. Take a brief look to find where things live so you can write good assignments. They are not for carrying out the task or doing the substantive investigation. Anything beyond a glance is itself a dispatched task. You have no tools that modify the workspace.

Dispatching: call \`dispatch\` with complete tasks. Each worker sees only its own assignment plus the workspace, not this conversation or the other tasks. Name exact files or areas, the work to do, and concrete acceptance criteria. Prefer independent tasks that run in parallel. Use depends_on only for genuine ordering. Never let two parallel tasks edit the same files. Worker model selection belongs to the user, so never try to select or change it.

After dispatch returns, summarize results for the user and propose next steps. Keep your own output in ASCII.`;

interface Args {
  cmd: string;
  request: string;
  workspace: string;
  yes: boolean;
  keepWorkers: boolean;
  extraDirs: string[];
  concurrency: number;
  model?: string;
  workerModel?: string;
  fresh: boolean;
}

function fail(msg: string): never {
  console.error(`omporch: ${msg}\n\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const cmd = argv[0];
  if (cmd !== "run" && cmd !== "chat") fail("expected subcommand 'chat' or 'run'");
  const rest = argv.slice(1);
  let request = "";
  let workspace = "";
  let yes = false;
  let keepWorkers = false;
  const extraDirs: string[] = [];
  let concurrency = 4;
  let model: string | undefined;
  let workerModel: string | undefined;
  let fresh = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === undefined) continue;
    switch (a) {
      case "-w":
      case "--workspace":
        workspace = rest[++i] ?? "";
        break;
      case "-y":
      case "--yes":
        yes = true;
        break;
      case "--keep-workers":
        keepWorkers = true;
        break;
      case "--allow-dir":
        extraDirs.push(rest[++i] ?? "");
        break;
      case "-c":
      case "--concurrency":
        concurrency = Number(rest[++i] ?? "4");
        break;
      case "--model":
        model = rest[++i];
        break;
      case "--worker-model":
        workerModel = rest[++i];
        break;
      case "--new":
        fresh = true;
        break;
      default:
        if (a.startsWith("-")) fail(`unknown flag ${a}`);
        if (!request) request = a;
        else fail(`unexpected argument ${a}`);
    }
  }
  if (!workspace) fail("missing -w <workspace>");
  if (cmd === "run" && !request) fail("run: missing <request>");
  if (!Number.isInteger(concurrency) || concurrency < 1) fail("concurrency must be a positive integer");
  return { cmd, request, workspace, yes, keepWorkers, concurrency, model, workerModel, fresh, extraDirs };
}

async function runChat(args: Args): Promise<void> {
  const workspace = await realpath(args.workspace).catch(() => fail(`workspace not found: ${args.workspace}`));
  const extraDirs = await resolveExtraDirs(args.extraDirs, workspace);
  const ext = join(import.meta.dir, "..", "ext", "orchestrator.ts");
  const directives = await loadDirectives();
  const role = directives ? `${ORCHESTRATOR_ROLE}\n\n# Standing directives\n${directives}` : ORCHESTRATOR_ROLE;
  const env = {
    ...process.env,
    OMPORCH: "1",
    OMPORCH_WORKSPACE: workspace,
    OMPORCH_CONCURRENCY: String(args.concurrency),
    OMPORCH_KEEP_WORKERS: args.keepWorkers ? "1" : "0",
    OMPORCH_EXTRA_DIRS: JSON.stringify(extraDirs),
    ...(args.workerModel ? { OMPORCH_MODEL: args.workerModel } : {}),
  };
  const tools = "read,grep,glob,bash,lsp,web_search";
  const ompboxHome = process.env.OMPBOX_HOME ?? join(homedir(), ".ompbox");
  const slug = workspace.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root";
  const sessionDir = join(ompboxHome, "orch-sessions", slug);
  const ompArgs = ["--cwd", workspace, "--tools", tools, "--session-dir", sessionDir, "-e", ext, "--append-system-prompt", role];
  if (!args.fresh) ompArgs.push("--continue");
  if (args.model) ompArgs.push("--model", args.model);
  const proc = Bun.spawn(["omp", ...ompArgs], { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  process.exit(await proc.exited);
}

async function runBatch(args: Args): Promise<void> {
  const workspace = await realpath(args.workspace).catch(() => fail(`workspace not found: ${args.workspace}`));
  const extraDirs = await resolveExtraDirs(args.extraDirs, workspace);
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const runId = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
  const ompboxHome = process.env.OMPBOX_HOME ?? join(homedir(), ".ompbox");
  const runDir = join(ompboxHome, "runs", runId);
  await mkdir(runDir, { recursive: true });

  console.error(`orch run ${runId} | workspace ${workspace}`);
  console.error("orch planning...");
  const directives = await loadDirectives();
  const plan = await buildPlan(args.request, workspace, args.model, directives);
  await Bun.write(join(runDir, "plan.json"), JSON.stringify(plan, null, 2));

  console.error("");
  if (plan.rationale) console.error(`plan: ${plan.rationale}\n`);
  if (extraDirs.length > 0) {
    console.error("approved read only mounts:");
    for (const dir of extraDirs) console.error(`  - ${dir}`);
    console.error("");
  }
  for (const t of plan.tasks) {
    const dep = t.depends_on?.length ? `  (after: ${t.depends_on.join(", ")})` : "";
    console.error(`  - ${t.id}: ${t.title}${dep}`);
  }
  console.error("");

  if (!args.yes) {
    const ans = prompt(`Proceed with ${plan.tasks.length} task(s)? [y/N]`) ?? "";
    if (!/^y(es)?$/i.test(ans.trim())) {
      console.error("aborted.");
      process.exit(0);
    }
  }

  const results = await executePlan(plan, {
    workspace,
    runId,
    runDir,
    concurrency: args.concurrency,
    model: args.model,
    extraDirs,
    keepWorkers: args.keepWorkers,
    log: (m) => console.error(`orch ${m}`),
  });
  await Bun.write(join(runDir, "results.json"), JSON.stringify(results, null, 2));

  console.error("orch synthesizing report...");
  const report = toAscii(await synthesize(args.request, results, { workspace, model: args.model, directives }));
  const reportPath = join(runDir, "report.md");
  await Bun.write(reportPath, `${report}\n`);

  const done = results.filter((r) => r.status === "done").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const blocked = results.filter((r) => r.status === "blocked").length;
  const totalCost = results.reduce((s, r) => s + r.costUSD, 0);
  console.error(`\norch done: ${done} done, ${failed} failed, ${blocked} blocked | cost ~$${totalCost.toFixed(4)} | ${reportPath}`);
  console.log(report);
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));
  if (args.cmd === "chat") return runChat(args);
  return runBatch(args);
}

main().catch((e) => {
  console.error(`orch error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
