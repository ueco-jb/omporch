import { join } from "node:path";

const DIR = join(import.meta.dir, "..", "..", "directives");

export async function loadDirectives(): Promise<string> {
  const parts: string[] = [];
  for (const f of ["RULES.md", "AGENTS.md"]) {
    const file = Bun.file(join(DIR, f));
    if (await file.exists()) parts.push((await file.text()).trim());
  }
  return parts.join("\n\n");
}
