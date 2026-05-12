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

  switch (provider) {
    case "linkedin":
      return publishJobToLinkedIn(job, integration, publicJobUrl);

    case "indeed":
    case "naukri":
    case "monster":
    case "glassdoor":
      // Stubbed identically to LinkedIn for now. Phase 3 wires partner APIs per provider.
      if (!integration || integration.status !== "connected") {
        return {
          ok: false,
          errorCode: "not_connected",
          message: `${provider} account is not connected for this recruiter.`,
        };
      }
      return {
        ok: true,
        externalPostId: `${provider}-${Date.now()}`,
        externalUrl: publicJobUrl,
        metadata: { stub: true, provider, jobTitle: job.title },
      };
  }
}
