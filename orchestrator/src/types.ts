
export interface Task {
  id: string;
  title: string;
  assignment: string;
  depends_on?: string[];
}

export interface Plan {
  rationale?: string;
  tasks: Task[];
}

export type Status = "done" | "failed" | "blocked";

export interface TaskResult {
  id: string;
  title: string;
  status: Status;
  summary: string;
  costUSD: number;
  container: string;
}
