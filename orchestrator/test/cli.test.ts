import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface CliResult {
  exitCode: number;
  stderr: string;
}

async function runCli(root: string, args: string[], withFakeOmp = false): Promise<CliResult> {
  const workspace = join(root, "workspace");
  const binDir = join(root, "bin");
  const ompArgsFile = join(root, "omp-args.json");
  await mkdir(workspace, { recursive: true });
  if (withFakeOmp) {
    await mkdir(binDir, { recursive: true });
    const omp = join(binDir, "omp");
    await Bun.write(omp, "#!/usr/bin/env bun\nawait Bun.write(process.env.OMP_ARGS_FILE!, JSON.stringify(Bun.argv.slice(2)));\n");
    await chmod(omp, 0o755);
  }
  const cli = join(import.meta.dir, "..", "..", "bin", "omporch");
  const proc = Bun.spawn([cli, ...args.map((arg) => arg === "$WORKSPACE" ? workspace : arg)], {
    env: {
      ...process.env,
      OMPBOX_HOME: join(root, "state"),
      OMP_ARGS_FILE: ompArgsFile,
      PATH: withFakeOmp ? `${binDir}:${process.env.PATH ?? ""}` : process.env.PATH,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  return { exitCode, stderr };
}

function selectedSessionArgs(args: string[]): string[] {
  const continueIndex = args.indexOf("--continue");
  if (continueIndex >= 0) return [args[continueIndex]!];
  const resumeIndex = args.indexOf("--resume");
  if (resumeIndex < 0) return [];
  const value = args[resumeIndex + 1];
  return value && !value.startsWith("-") ? [args[resumeIndex]!, value] : [args[resumeIndex]!];
}

test("explicit chat session flags bypass the TTY menu and preserve OMP arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "omporch-cli-"));
  const argsFile = join(root, "omp-args.json");
  const cases: Array<{ flags: string[]; expected: string[] }> = [
    { flags: ["--new"], expected: [] },
    { flags: ["--continue"], expected: ["--continue"] },
    { flags: ["--resume", "session-id"], expected: ["--resume", "session-id"] },
    { flags: ["--resume=equal-id"], expected: ["--resume", "equal-id"] },
    { flags: ["--resume"], expected: ["--resume"] },
  ];
  try {
    for (const { flags, expected } of cases) {
      const result = await runCli(root, ["chat", "-w", "$WORKSPACE", ...flags], true);
      expect(result.exitCode).toBe(0);
      const ompArgs = JSON.parse(await readFile(argsFile, "utf8")) as string[];
      expect(selectedSessionArgs(ompArgs)).toEqual(expected);
      expect(ompArgs).toContain("--session-dir");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects conflicting and repeated chat session flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "omporch-cli-"));
  try {
    for (const flags of [["--new", "--continue"], ["--resume", "first", "--resume=second"], ["--new", "--new"]]) {
      const result = await runCli(root, ["chat", "-w", "$WORKSPACE", ...flags]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("conflicting or repeated chat session flag");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects chat session flags on batch runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "omporch-cli-"));
  try {
    const result = await runCli(root, ["run", "work", "-w", "$WORKSPACE", "--new"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("session flags apply only to chat");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires an explicit session flag when the menu has no TTY", async () => {
  const root = await mkdtemp(join(tmpdir(), "omporch-cli-"));
  try {
    const result = await runCli(root, ["chat", "-w", "$WORKSPACE"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("chat session selection requires a TTY; use --new, --continue, --resume ID, or bare --resume");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
