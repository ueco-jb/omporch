import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveExtraDirs } from "../src/mounts.ts";

test("resolves only approved directories outside the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "omporch-mounts-"));
  const workspace = join(root, "workspace");
  const inside = join(workspace, "inside");
  const outside = join(root, "outside");
  await mkdir(inside, { recursive: true });
  await mkdir(outside);

  try {
    await expect(resolveExtraDirs([inside], workspace)).rejects.toThrow("overlaps the workspace");
    await expect(resolveExtraDirs([root], workspace)).rejects.toThrow("overlaps the workspace");
    await expect(resolveExtraDirs([outside, outside], workspace)).resolves.toEqual([outside]);
    await expect(resolveExtraDirs(["bad:path"], workspace)).rejects.toThrow("invalid extra directory path");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
