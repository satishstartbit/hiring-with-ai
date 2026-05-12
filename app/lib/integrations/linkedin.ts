import "server-only";
import type { IJob } from "../db/models/Job";
import type { IntegrationDoc } from "../db/models/Integration";
import { generateLinkedInPostCopy } from "../ai/jobGeneration";

/**
 * Build the official LinkedIn "share offsite" URL. Opening this in a popup lets
 * the recruiter publish the job link to their feed without needing the
 * w_member_social UGC API — the recommended path for an MVP.
 */
export function buildLinkedInShareUrl(jobUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`;
}

export type PublishResult = {
  ok: true;
  externalPostId: string;
  externalUrl: string;
  metadata?: Record<string, unknown>;
};

export type PublishFailure = {
  ok: false;
  errorCode: "not_connected" | "token_expired" | "api_error" | "stub";
  message: string;
};

function buildLinkedInCardDescription(job: IJob): string {
  const bits: string[] = [];
  const locationLine = [job.workMode, job.location].filter(Boolean).join(" · ");
  if (locationLine) bits.push(locationLine);
  if (job.experienceRequired) bits.push(`${job.experienceRequired} experience`);
  if (job.type) bits.push(job.type);
  const head = bits.join(" • ");

  // LinkedIn truncates around 200 chars in the card; keep it tight.
  const summary = (job.description || "").replace(/\s+/g, " ").trim().slice(0, 180);
  return [head, summary].filter(Boolean).join(" — ");
}

function buildLinkedInJobPostText(job: IJob, jobUrl: string): string {
  const lines: string[] = [];
  lines.push(`🚀 We're hiring a ${job.title}!`);
  if (job.department) lines.push(`Department: ${job.department}`);
  lines.push("");

  if (job.experienceRequired) lines.push(`Experience: ${job.experienceRequired}`);
  const locationLine = [job.workMode, job.location].filter(Boolean).join(" · ");
  if (locationLine) lines.push(`Location: ${locationLine}`);
  if (job.skills?.length) lines.push(`Skills: ${job.skills.slice(0, 8).join(", ")}`);

  lines.push("");
  lines.push("Apply here:");
  lines.push(jobUrl);

  return lines.join("\n");
}

type LinkedInErrorInfo = {
  message: string;
  duplicateUrn: string | null;
};

async function readLinkedInError(res: Response): Promise<LinkedInErrorInfo> {
  const text = await res.text().catch(() => "");
  let message = `LinkedIn API ${res.status}`;
  if (text) {
    try {
      const parsed = JSON.parse(text) as { message?: string; serviceErrorCode?: number };
      if (parsed.message) message = parsed.message;
      else message = `${res.status}: ${text.slice(0, 240)}`;
    } catch {
      message = `${res.status}: ${text.slice(0, 240)}`;
    }
  }
  // LinkedIn deduplicates content per author. When a duplicate is detected,
  // its error message contains the existing post URN — capture it so we can
  // record the publication that already exists instead of treating it as
  // a hard failure.
  const dup = /duplicate of\s+(urn:li:share:\d+)/i.exec(message);
  return { message, duplicateUrn: dup ? dup[1] : null };
}

/**
 * Publish the job to the recruiter's personal LinkedIn feed using the stored
 * OAuth access token. The post body contains a link back to our public job
 * page; clicking it lands the candidate at /jobs/{id} on this portal where
 * the Apply flow takes over.
 */
export async function publishJobToLinkedIn(
  job: IJob,
  integration: IntegrationDoc | null,
  publicJobUrl: string
): Promise<PublishResult | PublishFailure> {
  // if (!integration || integration.status !== "connected") {
  //   return {
  //     ok: false,
  //     errorCode: "not_connected",
  //     message: "LinkedIn account is not connected for this recruiter.",
  //   };
  // }

  // if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() < Date.now()) {
  //   return {
  //     ok: false,
  //     errorCode: "token_expired",
  //     message: "LinkedIn access token expired. Please reconnect.",
  //   };
  // }

  // if (!integration.accessToken) {
  //   return {
  //     ok: false,
  //     errorCode: "not_connected",
  //     message: "LinkedIn access token is missing. Please reconnect.",
  //   };
  // }

  // if (!integration.externalAccountId) {
  //   return {
  //     ok: false,
  //     errorCode: "api_error",
  //     message:
  //       "LinkedIn person URN is missing on this integration. Disconnect and reconnect to refresh your profile.",
  //   };
  // }

  const author = `urn:li:person:${integration.externalAccountId}`;

  // AI-generated commentary first — falls back to the template if the LLM
  // call fails for any reason (rate limit, network, model error). The
  // template still produces a valid, postable result.
  let commentary: string;
  let commentarySource: "ai" | "template" = "template";
  try {
    const aiText = await generateLinkedInPostCopy({
      title: job.title,
      department: job.department,
      location: job.location,
      workMode: job.workMode,
      employmentType: job.type,
      experienceRequired: job.experienceRequired,
      skills: job.skills,
      description: job.description,
      jobUrl: publicJobUrl,
    });
    if (aiText && aiText.length >= 80) {
      commentary = aiText;
      commentarySource = "ai";
    } else {
      commentary = buildLinkedInJobPostText(job, publicJobUrl);
    }
  } catch {
    commentary = buildLinkedInJobPostText(job, publicJobUrl);
  }

  const cardTitle = `${job.title} — ${job.department || "We're hiring"}`;
  const cardDescription = buildLinkedInCardDescription(job);

  let res: Response;
  try {
    res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          // ARTICLE media category turns the post into a clickable card with
          // title + description + (LinkedIn-scraped) thumbnail, instead of a
          // plain text post. Clicking the card sends the candidate to our
          // portal's public job page, where the Apply button takes over.
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: commentary },
            shareMediaCategory: "ARTICLE",
            media: [
              {
                status: "READY",
                originalUrl: publicJobUrl,
                title: { text: cardTitle },
                description: { text: cardDescription },
              },
            ],
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });

    console.log("LinkedIn API response", { status: res.status, statusText: res });
  } catch (e) {
    return {
      ok: false,
      errorCode: "api_error",
      message: e instanceof Error ? `LinkedIn fetch failed: ${e.message}` : "LinkedIn fetch failed",
    };
  }

  if (!res.ok) {
    const { message, duplicateUrn } = await readLinkedInError(res);

    // LinkedIn 422 dedup: the post already exists. Treat as success and
    // record the existing URN so the publishing history points at the
    // real feed item instead of showing a confusing failure.
    if (duplicateUrn) {
      return {
        ok: true,
        externalPostId: duplicateUrn,
        externalUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(duplicateUrn)}/`,
        metadata: {
          author,
          jobTitle: job.title,
          jobUrl: publicJobUrl,
          commentary,
          commentarySource,
          duplicateOfExisting: true,
        },
      };
    }

    const errorCode: PublishFailure["errorCode"] =
      res.status === 401 || res.status === 403 ? "not_connected" : "api_error";
    return { ok: false, errorCode, message };
  }

  const headerUrn = res.headers.get("x-restli-id") ?? "";
  let bodyUrn = "";
  try {
    const body = (await res.json()) as { id?: string };
    bodyUrn = body.id ?? "";
  } catch {
    // 201 responses sometimes have empty bodies; the URN comes from the header.
  }
  const urn = headerUrn || bodyUrn;
  if (!urn) {
    return {
      ok: false,
      errorCode: "api_error",
      message: "LinkedIn accepted the post but returned no URN.",
    };
  }

  return {
    ok: true,
    externalPostId: urn,
    externalUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/`,
    metadata: {
      author,
      jobTitle: job.title,
      jobUrl: publicJobUrl,
      commentary,
      commentarySource,
    },
  };
}
