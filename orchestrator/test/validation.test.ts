import { describe, expect, test } from "bun:test";
import type { Task } from "../src/types.ts";
import { validateTasks } from "../src/validation.ts";

function task(id: string, depends_on?: string[]): Task {
  return { id, title: id, assignment: `complete ${id}`, depends_on };
}

describe("task validation", () => {
  test("accepts an acyclic plan", () => {
    expect(() => validateTasks([task("first"), task("second", ["first"])] )).not.toThrow();
  });

  test("rejects unsafe and duplicate ids", () => {
    expect(() => validateTasks([task("../escape")])).toThrow("invalid task id");
    expect(() => validateTasks([task("same"), task("same")])).toThrow("duplicate task id");
  });

  test("rejects invalid dependencies", () => {
    expect(() => validateTasks([task("first", ["missing"])] )).toThrow("unknown task");
    expect(() => validateTasks([task("first", ["first"])] )).toThrow("depends on itself");
  });

  test("rejects dependency cycles", () => {
    expect(() => validateTasks([task("first", ["second"]), task("second", ["first"])] )).toThrow(
      "dependency cycle",
    );
  });
});
