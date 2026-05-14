import "server-only";
import type { IJob } from "../db/models/Job";
import {
  Integration,
  type IntegrationProvider,
  type IntegrationDoc,
} from "../db/models/Integration";
import { publishJobToLinkedIn, type PublishResult, type PublishFailure } from "./linkedin";

export type DispatchResult = PublishResult | PublishFailure;

export async function dispatchPublish({
  provider,
  job,
  userId,
  publicJobUrl,
}: {
  provider: IntegrationProvider;
  job: IJob;
  userId: string;
  publicJobUrl: string;
}): Promise<DispatchResult> {
  const integration = (await Integration.findOne({
    userId,
    provider,
    deletedAt: null,
  })) as IntegrationDoc | null;

  // LinkedIn is the only supported provider today.
  return publishJobToLinkedIn(job, integration, publicJobUrl);
}
