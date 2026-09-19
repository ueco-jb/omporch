import { expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSessionAge, listChatSessions, moveSessionSelection, ompSessionArgs, parseSessionMenuKeys, renderSessionMenu, sessionMenuChoices, type ChatSession } from "../src/sessions.ts";

const now = Date.UTC(2026, 8, 19, 12);
const sessions: ChatSession[] = [
  { id: "01a0b683-615c-7000-8eca-a652b65c58c9", title: "Remove unused TransactionBuilder import", updatedAt: now - 12 * 60 * 60 * 1000 },
  { id: "01a0b659-2304-7000-a3be-ef23c227f2d8", title: "Fix legacy hash-only nonce release", updatedAt: now - 15 * 60 * 60 * 1000 },
];

test("lists valid sessions by recent activity through the OMP listing API", async () => {
  const root = await mkdtemp(join(tmpdir(), "omporch-sessions-"));
  const olderPath = join(root, "older.jsonl");
  const newerPath = join(root, "newer.jsonl");
  try {
    await Bun.write(olderPath, `${JSON.stringify({ type: "title", title: "  Older\u001b[31m context\u0007  " })}\n${JSON.stringify({ type: "session", id: "older-id" })}\n${"x".repeat(20_000)}`);
    await Bun.write(newerPath, `${JSON.stringify({ type: "session", id: "newer-id", title: "Newer context" })}\n`);
    await Bun.write(join(root, "invalid.jsonl"), `${JSON.stringify({ type: "session", id: "bad/id", title: "Invalid" })}\n`);
    await Bun.write(join(root, "broken.jsonl"), "not-json\n");
    await utimes(olderPath, new Date(now - 2000), new Date(now - 2000));
    await utimes(newerPath, new Date(now - 1000), new Date(now - 1000));
    expect(await listChatSessions(root)).toEqual([
      { id: "newer-id", title: "Newer context", updatedAt: now - 1000 },
      { id: "older-id", title: "Older [31m context", updatedAt: now - 2000 },
    ]);
    expect(await listChatSessions(join(root, "missing"))).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renders sanitized recent session choices with exact continue wording", () => {
  expect(renderSessionMenu("liquidity-\u001b[2Jimpl2", sessions, now)).toBe("omporch: liquidity- [2Jimpl2\n\n  1. New session\n  2. Continue OMP session for this terminal\n  3. Remove unused TransactionBuilder import\n     01a0b683... | 12 hours ago\n  4. Fix legacy hash-only nonce release\n     01a0b659... | 15 hours ago\n  a. Browse all sessions\n  q. Quit");
});

test("orders choices and handles arrow key state with wrapping", () => {
  expect(sessionMenuChoices(sessions)).toEqual([{ kind: "new" }, { kind: "continue" }, { kind: "resume", id: sessions[0]!.id }, { kind: "resume", id: sessions[1]!.id }, { kind: "browse" }, { kind: "quit" }]);
  expect(parseSessionMenuKeys(`ignored\x1b[A\x1b[B\r\x03`)).toEqual({ keys: ["up", "down", "enter", "quit"], remainder: "" });
  expect(parseSessionMenuKeys("\x1b[")).toEqual({ keys: [], remainder: "\x1b[" });
  expect(moveSessionSelection(1, "down", 6)).toBe(2);
  expect(moveSessionSelection(0, "up", 6)).toBe(5);
  expect(renderSessionMenu("liquidity-impl2", sessions, now, 2)).toContain("  \u001b[7m3. Remove unused TransactionBuilder import\u001b[0m\n");
});

test("maps every menu action to exact OMP session arguments", () => {
  const choices = sessionMenuChoices(sessions);
  expect(ompSessionArgs(choices[0]!)).toEqual([]);
  expect(ompSessionArgs(choices[1]!)).toEqual(["--continue"]);
  expect(ompSessionArgs(choices[3]!)).toEqual(["--resume", sessions[1]!.id]);
  expect(ompSessionArgs(choices[4]!)).toEqual(["--resume"]);
  expect(ompSessionArgs(choices[5]!)).toEqual([]);
});

test("renders an empty workspace without inventing a recent session", () => {
  expect(sessionMenuChoices([])).toEqual([{ kind: "new" }, { kind: "continue" }, { kind: "browse" }, { kind: "quit" }]);
  expect(renderSessionMenu("empty", [], now)).toContain("     No recent sessions\n");
  expect(formatSessionAge(now - 60_000, now)).toBe("1 minute ago");
});
