import { z } from "zod";
import { EMPLOYMENT_TYPES, WORK_MODES } from "../db/models/Job";
import { INTEGRATION_PROVIDERS } from "../db/models/Integration";

const SalarySchema = z
  .object({
    min: z.coerce.number().min(0),
    max: z.coerce.number().min(0),
    currency: z.string().min(1).max(8).default("USD"),
    period: z.enum(["year", "month", "hour"]).default("year"),
  })
  .refine((s) => s.max >= s.min, { message: "Salary max must be ≥ min" });

const InterviewRoundSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  type: z
    .enum(["screening", "technical", "system_design", "behavioral", "managerial", "hr", "other"])
    .default("technical"),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
});

export const JobDraftSchema = z.object({
  title: z.string().min(2).max(160).trim(),
  department: z.string().min(2).max(80).trim(),
  location: z.string().min(2).max(160).trim(),
  workMode: z.enum(WORK_MODES),
  type: z.enum(EMPLOYMENT_TYPES),
  experienceRequired: z.string().max(120).trim().optional().default(""),
  numberOfOpenings: z.coerce.number().int().min(1).max(500).default(1),
  skills: z.array(z.string().trim().min(1)).max(40).default([]),
  salary: SalarySchema.nullable().optional().default(null),
  interviewRounds: z.array(InterviewRoundSchema).max(10).default([]),
  description: z.string().max(8000).optional().default(""),
  requirements: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  responsibilities: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  preferredQualifications: z.array(z.string().trim().min(1)).max(40).optional().default([]),
});
export type JobDraftInput = z.infer<typeof JobDraftSchema>;

export const JobUpdateSchema = JobDraftSchema.partial().extend({
  screeningQuestions: z.array(z.string().trim().min(1)).max(40).optional(),
  suggestedSkills: z.array(z.string().trim().min(1)).max(40).optional(),
  interviewProcessSummary: z.string().max(800).optional(),
  status: z.enum(["draft", "ai_generated", "active", "closed", "filled"]).optional(),
});

export const PublishSchema = z.object({
  providers: z.array(z.enum(INTEGRATION_PROVIDERS)).min(1, "Select at least one platform"),
});
