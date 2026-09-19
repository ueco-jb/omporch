import { FileSessionStorage, listSessionsReadOnly } from "@oh-my-pi/pi-coding-agent";
import { toAscii } from "./util.ts";

export const MAX_MENU_SESSIONS = 8;

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
}

export type ChatSessionChoice = { kind: "new" } | { kind: "continue" } | { kind: "resume"; id: string } | { kind: "browse" } | { kind: "quit" };
export type SessionMenuKey = "up" | "down" | "enter" | "quit";

interface SessionMenuInput extends NodeJS.ReadStream {
  setRawMode(mode: boolean): this;
}

interface SessionMenuOutput extends NodeJS.WriteStream {
  isTTY: boolean;
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function sanitizeLabel(value: string): string {
  return toAscii(value).replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function listChatSessions(sessionDir: string): Promise<ChatSession[]> {
  const sessions = await listSessionsReadOnly(sessionDir, new FileSessionStorage());
  return sessions
    .filter((session) => SESSION_ID.test(session.id) && Number.isFinite(session.modified.getTime()))
    .map((session) => ({
      id: session.id,
      title: sanitizeLabel(session.title || session.firstMessage) || "(untitled)",
      updatedAt: session.modified.getTime(),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function formatSessionAge(updatedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(updatedAt).toISOString().slice(0, 10);
}

function displayTitle(title: string): string {
  const safe = sanitizeLabel(title) || "(untitled)";
  return safe.length <= 72 ? safe : `${safe.slice(0, 69)}...`;
}

export function sessionMenuChoices(sessions: ChatSession[]): ChatSessionChoice[] {
  return [{ kind: "new" }, { kind: "continue" }, ...sessions.slice(0, MAX_MENU_SESSIONS).map((session) => ({ kind: "resume" as const, id: session.id })), { kind: "browse" }, { kind: "quit" }];
}

export function renderSessionMenu(workspaceName: string, sessions: ChatSession[], now = Date.now(), selectedIndex?: number): string {
  const recent = sessions.slice(0, MAX_MENU_SESSIONS);
  let itemIndex = 0;
  const item = (label: string): string => `  ${itemIndex++ === selectedIndex ? `\x1b[7m${label}\x1b[0m` : label}`;
  const lines = [`omporch: ${sanitizeLabel(workspaceName)}`, "", item("1. New session"), item("2. Continue OMP session for this terminal")];
  for (let i = 0; i < recent.length; i++) {
    const session = recent[i];
    if (!session) continue;
    lines.push(item(`${i + 3}. ${displayTitle(session.title)}`), `     ${session.id.slice(0, 8)}... | ${formatSessionAge(session.updatedAt, now)}`);
  }
  if (recent.length === 0) lines.push("     No recent sessions");
  lines.push(item("a. Browse all sessions"), item("q. Quit"));
  return lines.join("\n");
}

export function moveSessionSelection(selectedIndex: number, direction: "up" | "down", itemCount: number): number {
  if (itemCount < 1) return 0;
  return (selectedIndex + (direction === "up" ? -1 : 1) + itemCount) % itemCount;
}

export function parseSessionMenuKeys(buffer: string): { keys: SessionMenuKey[]; remainder: string } {
  const keys: SessionMenuKey[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const char = buffer[offset];
    if (char === "\x1b") {
      if (buffer.length - offset < 3) break;
      const sequence = buffer.slice(offset, offset + 3);
      if (sequence === "\x1b[A") keys.push("up");
      else if (sequence === "\x1b[B") keys.push("down");
      else keys.push("quit");
      offset += 3;
    } else {
      if (char === "\r" || char === "\n") keys.push("enter");
      else if (char === "\x03" || char === "q" || char === "Q") keys.push("quit");
      offset++;
    }
  }
  return { keys, remainder: buffer.slice(offset) };
}

export async function selectChatSession(workspaceName: string, sessions: ChatSession[], input: SessionMenuInput = process.stdin, output: SessionMenuOutput = process.stderr): Promise<ChatSessionChoice> {
  if (!input.isTTY || !output.isTTY) throw new Error("chat session selection requires a TTY");
  const choices = sessionMenuChoices(sessions);
  let selectedIndex = 1;
  let pending = "";
  let renderedLines = 0;
  const wasRaw = input.isRaw === true;
  const draw = (): void => {
    if (renderedLines > 0) output.write(`\x1b[${renderedLines}F\x1b[J`);
    const menu = renderSessionMenu(workspaceName, sessions, Date.now(), selectedIndex);
    renderedLines = menu.split("\n").length;
    output.write(`${menu}\n`);
  };
  input.setRawMode(true);
  try {
    input.resume();
    draw();
    return await new Promise<ChatSessionChoice>((resolve, reject) => {
      let settled = false;
      const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
      const signalHandlers: Partial<Record<(typeof signals)[number], () => void>> = {};
      const cleanup = (): void => {
        input.off("data", onData);
        input.off("end", onEnd);
        input.off("error", onError);
        for (const signal of signals) {
          const handler = signalHandlers[signal];
          if (handler) process.off(signal, handler);
        }
      };
      const finish = (choice: ChatSessionChoice): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(choice);
      };
      const onData = (chunk: Buffer | string): void => {
        pending += chunk.toString();
        const parsed = parseSessionMenuKeys(pending);
        pending = parsed.remainder;
        for (const key of parsed.keys) {
          if (key === "quit") return finish({ kind: "quit" });
          if (key === "enter") return finish(choices[selectedIndex] ?? { kind: "quit" });
          selectedIndex = moveSessionSelection(selectedIndex, key, choices.length);
          draw();
        }
      };
      const onEnd = (): void => finish({ kind: "quit" });
      const onError = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      input.on("data", onData);
      input.once("end", onEnd);
      input.once("error", onError);
      for (const signal of signals) {
        const handler = (): void => {
          cleanup();
          input.setRawMode(wasRaw);
          output.write("\x1b[0m\n");
          process.kill(process.pid, signal);
        };
        signalHandlers[signal] = handler;
        process.once(signal, handler);
      }
    });
  } finally {
    input.setRawMode(wasRaw);
    input.pause();
    output.write("\x1b[0m");
  }
}

export function ompSessionArgs(choice: ChatSessionChoice): string[] {
  if (choice.kind === "continue") return ["--continue"];
  if (choice.kind === "resume") return ["--resume", choice.id];
  if (choice.kind === "browse") return ["--resume"];
  return [];
}
