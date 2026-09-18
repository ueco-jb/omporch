import { stat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
function contains(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}


export async function resolveExtraDirs(inputs: string[], workspace: string): Promise<string[]> {
  const root = await realpath(workspace);
  const agentState = join(homedir(), ".omp", "agent");
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    if (/[\t\r\n:]/.test(input)) throw new Error(`invalid extra directory path: ${input}`);
    const path = await realpath(input).catch(() => {
      throw new Error(`extra directory not found: ${input}`);
    });
    if (/[\t\r\n:]/.test(path)) throw new Error(`invalid extra directory path: ${path}`);
    const info = await stat(path);
    if (!info.isDirectory()) throw new Error(`extra path is not a directory: ${input}`);
    if (contains(root, path) || contains(path, root)) {
      throw new Error(`extra directory overlaps the workspace: ${input}`);
    }
    if (contains(agentState, path) || contains(path, agentState)) {
      throw new Error(`extra directory overlaps agent state: ${input}`);
    }
    if (!seen.has(path)) {
      seen.add(path);
      resolved.push(path);
    }
  }

  return resolved;
}

export function parseExtraDirs(value: string | undefined): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("invalid extra directory configuration");
  }
  return parsed;
}
