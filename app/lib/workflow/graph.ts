import { StateGraph, START, END } from "@langchain/langgraph";
import { HiringStateAnnotation, type WorkflowStep } from "./state";
import { analyzeRequestNode } from "./nodes/analyzeRequest";
import { generateJobDescriptionNode } from "./nodes/generateJobDescription";
import { postJobNode } from "./nodes/postJob";
import { trackCandidatesNode } from "./nodes/trackCandidates";
import { connectDB } from "../db/connection";
import WorkflowRun from "../db/models/WorkflowRun";
import { traceable } from "langsmith/traceable";

type HiringState = typeof HiringStateAnnotation.State;

// Conditional edge: stop at END on error, otherwise continue to next node
function routeOrStop(next: string) {
  return (state: HiringState): string =>
    state.error ? END : next;
}

// Wrap each node so intermediate step state is persisted to MongoDB after every step
function withPersist(
  stepName: string,
  fn: (state: HiringState) => Promise<Partial<HiringState>>
) {
  return async (state: HiringState): Promise<Partial<HiringState>> => {
    console.log(`[Hiring Workflow] ${stepName} started`);

    const update = await fn(state);
    const step = update.steps?.find((s) => s.name === stepName);

    if (update.error || step?.status === "failed") {
      console.error(
        `[Hiring Workflow] ${stepName} failed: ${step?.error ?? update.error}`
      );
    } else if (step?.status === "completed") {
      console.log(`[Hiring Workflow] ${stepName} completed`);
    }

    if (state.workflowRunId && update.steps) {
      await WorkflowRun.findByIdAndUpdate(state.workflowRunId, {
        steps: update.steps,
      });
    }
    return update;
  };
}

// Build and compile the LangGraph StateGraph once
const workflow = new StateGraph(HiringStateAnnotation)
  .addNode("analyzeRequest", withPersist("Analyze Request", analyzeRequestNode))
  .addNode(
    "generateJobDescription",
    withPersist("Generate Job Description", generateJobDescriptionNode)
  )
  .addNode("postJob", withPersist("Post Job", postJobNode))
  .addNode(
    "openForApplications",
    withPersist("Open for Applications", trackCandidatesNode)
  )
  .addEdge(START, "analyzeRequest")
  .addConditionalEdges("analyzeRequest", routeOrStop("generateJobDescription"))
  .addConditionalEdges("generateJobDescription", routeOrStop("postJob"))
  .addConditionalEdges("postJob", routeOrStop("openForApplications"))
  .addEdge("openForApplications", END);

const compiledGraph = workflow.compile();

export const runHiringWorkflow = traceable(
  async (userRequest: string): Promise<{
    workflowRunId: string;
    steps: WorkflowStep[];
    jobId?: string;
    error?: string;
  }> => {
    await connectDB();

    const initialSteps: WorkflowStep[] = [
      { name: "Analyze Request", status: "pending" },
      { name: "Generate Job Description", status: "pending" },
      { name: "Post Job", status: "pending" },
      { name: "Open for Applications", status: "pending" },
    ];

    const workflowRun = await WorkflowRun.create({
      userRequest,
      status: "running",
      steps: initialSteps,
    });

    const workflowRunId = workflowRun._id.toString();

    const finalState = await compiledGraph.invoke({
      userRequest,
      workflowRunId,
      steps: initialSteps,
    });

    if (finalState.error) {
      await WorkflowRun.findByIdAndUpdate(workflowRunId, { status: "failed" });
    }

    return {
      workflowRunId,
      steps: finalState.steps,
      jobId: finalState.jobId,
      error: finalState.error,
    };
  },
  { name: "hiring_workflow", run_type: "chain", tags: ["hiring"] }
);
