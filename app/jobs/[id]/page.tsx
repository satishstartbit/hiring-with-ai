import { notFound } from "next/navigation";
import type { Metadata } from "next";
import mongoose from "mongoose";
import { connectDB } from "../../lib/db/connection";
import Job from "../../lib/db/models/Job";
import JobPageClient, { type PublicJob } from "./JobPageClient";

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function loadJob(id: string): Promise<PublicJob | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  await connectDB();
  const doc = await Job.findById(id).lean();
  if (!doc) return null;
  return {
    _id: String(doc._id),
    title: doc.title,
    department: doc.department,
    description: doc.description ?? "",
    requirements: doc.requirements ?? [],
    location: doc.location,
    type: doc.type,
    status: doc.status,
    applicantCount: doc.applicantCount ?? 0,
    createdAt: (doc.createdAt instanceof Date ? doc.createdAt : new Date()).toISOString(),
    postedAt: doc.postedAt ? new Date(doc.postedAt).toISOString() : undefined,
  };
}

function metaDescription(job: PublicJob): string {
  const head = [job.location, job.type].filter(Boolean).join(" · ");
  const body = (job.description || "").replace(/\s+/g, " ").trim();
  const combined = body ? `${head} — ${body}` : head;
  if (combined.length <= 200) return combined;
  return `${combined.slice(0, 197)}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await loadJob(id);
  if (!job) {
    return { title: "Job not found — HireAI" };
  }
  const title = `${job.title} — ${job.department || "We're hiring"}`;
  const description = metaDescription(job);
  const url = `${appBase()}/jobs/${id}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "HireAI",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: { canonical: url },
  };
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await loadJob(id);
  if (!job) notFound();
  return <JobPageClient job={job} />;
}
