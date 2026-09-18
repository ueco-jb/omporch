
export interface OmpRun {
  finalText: string;
  costUSD: number;
  exitCode: number;
  ok: boolean;
  stderr: string;
  events: unknown[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

interface OmpMessage {
  role?: string;
  text: string;
  costUSD: number;
}

function toMessage(v: unknown): OmpMessage | undefined {
  if (!isRecord(v)) return undefined;
  const role = typeof v.role === "string" ? v.role : undefined;
  let text = "";
  if (Array.isArray(v.content)) {
    for (const c of v.content) {
      if (isRecord(c) && c.type === "text" && typeof c.text === "string") text += c.text;
    }
  }
  let costUSD = 0;
  if (isRecord(v.usage) && isRecord(v.usage.cost) && typeof v.usage.cost.total === "number") {
    costUSD = v.usage.cost.total;
  }
  return { role, text, costUSD };
}

export function extractResult(events: unknown[]): { finalText: string; costUSD: number } {
  let messages: OmpMessage[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (isRecord(e) && e.type === "agent_end" && Array.isArray(e.messages)) {
      messages = e.messages.map(toMessage).filter((m): m is OmpMessage => m !== undefined);
      break;
    }
  }
  if (messages.length === 0) {
    for (const e of events) {
      if (isRecord(e) && e.type === "message_end") {
        const m = toMessage(e.message);
        if (m) messages.push(m);
      }
    }
  }
  let costUSD = 0;
  for (const m of messages) costUSD += m.costUSD;
  let finalText = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "assistant") {
      finalText = m.text;
      break;
    }
  }
  return { finalText: finalText.trim(), costUSD };
}

export async function runOmp(
  argv: string[],
  opts: { cwd?: string; signal?: AbortSignal } = {},
): Promise<OmpRun> {
  const proc = Bun.spawn(argv, {
    cwd: opts.cwd,
    signal: opts.signal,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const events: unknown[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const parsed: unknown = JSON.parse(t);
      events.push(parsed);
    } catch {
    }
  }
  const { finalText, costUSD } = extractResult(events);
  return { finalText, costUSD, exitCode, ok: exitCode === 0 && finalText.length > 0, stderr, events };
}
