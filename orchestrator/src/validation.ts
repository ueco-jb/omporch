import type { Task } from "./types.ts";

const TASK_ID = /^[a-z0-9](?:[a-z0-9-]{0,31})$/;

export function validateTasks(tasks: Task[]): void {
  if (tasks.length === 0) throw new Error("plan has no tasks");

  const byId = new Map<string, Task>();
  for (const task of tasks) {
    if (!TASK_ID.test(task.id)) throw new Error(`invalid task id: ${task.id}`);
    if (byId.has(task.id)) throw new Error(`duplicate task id: ${task.id}`);
    if (!task.title.trim()) throw new Error(`task '${task.id}' has no title`);
    if (!task.assignment.trim()) throw new Error(`task '${task.id}' has no assignment`);
    byId.set(task.id, task);
  }

  for (const task of tasks) {
    for (const dependency of task.depends_on ?? []) {
      if (dependency === task.id) throw new Error(`task '${task.id}' depends on itself`);
      if (!byId.has(dependency)) throw new Error(`task '${task.id}' depends on unknown task '${dependency}'`);
    }
  }

  const state = new Map<string, number>();
  const visit = (id: string): void => {
    const current = state.get(id) ?? 0;
    if (current === 1) throw new Error(`dependency cycle includes task '${id}'`);
    if (current === 2) return;
    state.set(id, 1);
    for (const dependency of byId.get(id)?.depends_on ?? []) visit(dependency);
    state.set(id, 2);
  };

  for (const task of tasks) visit(task.id);
}
