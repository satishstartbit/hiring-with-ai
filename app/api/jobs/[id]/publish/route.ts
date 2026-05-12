import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import { JobPublication } from "@/app/lib/db/models/JobPublication";
import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { PublishSchema } from "@/app/lib/validation/jobs";
import { dispatchPublish } from "@/app/lib/integrations/publish";
import { ok, err, fromError } from "@/app/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(PERMISSIONS.INTEGRATION_CONNECT);
    const { id } = await params;
    const { providers } = PublishSchema.parse(await req.json());

    await connectDB();
    const job = await Job.findOne({ _id: id, workspaceId: session.workspaceId });
    if (!job) return err("not_found", "Job not found", 404);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const publicJobUrl = `${baseUrl}/jobs/${job._id}`;

    const results = await Promise.all(
      providers.map(async (provider) => {
        const dispatch = await dispatchPublish({
          provider,
          job,
          userId: session.userId,
          publicJobUrl,
        });

        const baseDoc = {
          jobId: job._id,
          workspaceId: session.workspaceId,
          companyId: session.companyId,
          publishedBy: session.userId,
          provider,
        };

        if (dispatch.ok) {
          const pub = await JobPublication.findOneAndUpdate(
            { jobId: job._id, provider },
            {
              $set: {
                ...baseDoc,
                status: "published",
                externalPostId: dispatch.externalPostId,
                externalUrl: dispatch.externalUrl,
                publisherAccountEmail: session.email,
                publishedAt: new Date(),
                errorMessage: "",
                metadata: dispatch.metadata ?? null,
              },
            },
            { new: true, upsert: true }
          ).lean();
          return { provider, ok: true, publication: pub };
        }

        const pub = await JobPublication.findOneAndUpdate(
          { jobId: job._id, provider },
          {
            $set: {
              ...baseDoc,
              status: "failed",
              errorMessage: dispatch.message,
              externalPostId: "",
              externalUrl: "",
              metadata: null,
            },
            $unset: { publishedAt: "" },
          },
          { new: true, upsert: true }
        ).lean();
        return {
          provider,
          ok: false,
          errorCode: dispatch.errorCode,
          message: dispatch.message,
          publication: pub,
        };
      })
    );

    if (results.some((r) => r.ok) && job.status !== "active") {
      job.status = "active";
      job.postedAt = new Date();
      await job.save();
    }

    return ok({ results });
  } catch (e) {
    return fromError(e);
  }
}
