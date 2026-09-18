import { join } from "node:path";

export const OMPBOX = join(import.meta.dir, "..", "..", "bin", "ompbox");

interface ShResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function sh(argv: string[]): Promise<ShResult> {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { ok: code === 0, stdout, stderr };
}

export async function up(name: string, workspace: string, dirs: string[] = []): Promise<void> {
  const argv = [OMPBOX, "up", name, "-w", workspace];
  for (const d of dirs) argv.push("-d", `${d}:ro`);
  const r = await sh(argv);
  if (!r.ok) throw new Error(`ompbox up ${name} failed: ${(r.stderr || r.stdout).trim()}`);
}

export async function rm(name: string, purge = true): Promise<void> {
  const argv = [OMPBOX, "rm", name];
  if (purge) argv.push("--purge");
  const r = await sh(argv);
  if (!r.ok) throw new Error(`ompbox rm ${name} failed: ${(r.stderr || r.stdout).trim()}`);
}
