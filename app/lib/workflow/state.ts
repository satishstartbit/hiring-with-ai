import { Annotation } from "@langchain/langgraph";

export interface WorkflowStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  error?: string;
}

// Last-write-wins reducer for most fields
const last = <T>(a: T, b: T | undefined): T => b ?? a;

export const HiringStateAnnotation = Annotation.Root({
  userRequest: Annotation<string>({ reducer: last, default: () => "" }),
  workflowRunId: Annotation<string>({ reducer: last, default: () => "" }),

  // Analyzed intent
  role: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
  department: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
  location: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
  jobType: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
  requirements: Annotation<string[] | undefined>({ reducer: last, default: () => undefined }),

  // Generated content
  jobTitle: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
  jobDescription: Annotation<string | undefined>({ reducer: last, default: () => undefined }),

  // Post results
  jobId: Annotation<string | undefined>({ reducer: last, default: () => undefined }),

  // Workflow tracking
  steps: Annotation<WorkflowStep[]>({ reducer: last, default: () => [] }),
  error: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
});

export type HiringState = typeof HiringStateAnnotation.State;
