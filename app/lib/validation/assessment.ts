import { z } from "zod";
import {
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  CODING_LANGUAGES,
  QUESTION_COUNT_MODES,
} from "../db/models/AssessmentConfig";

const SectionMinimumSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  minPercent: z.coerce.number().int().min(0).max(100),
});

const PassingCriteriaSchema = z.object({
  overallPercent: z.coerce.number().int().min(0).max(100).default(60),
  sectionMinimums: z.array(SectionMinimumSchema).max(QUESTION_TYPES.length).default([]),
  mandatoryTypes: z.array(z.enum(QUESTION_TYPES)).max(QUESTION_TYPES.length).default([]),
});

const AntiCheatSchema = z.object({
  tabSwitchDetection: z.boolean().default(true),
  fullscreenRequired: z.boolean().default(false),
  blockCopyPaste: z.boolean().default(true),
  webcamMonitoring: z.boolean().default(false),
  trackSuspiciousActivity: z.boolean().default(true),
  maxViolations: z.coerce.number().int().min(0).max(50).default(3),
});

const CodingSettingsSchema = z.object({
  languages: z.array(z.enum(CODING_LANGUAGES)).default(["javascript", "python"]),
  timeoutSeconds: z.coerce.number().int().min(1).max(60).default(10),
  enableQualityAnalysis: z.boolean().default(true),
});

export const AssessmentConfigUpsertSchema = z
  .object({
    difficulty: z.enum(DIFFICULTY_LEVELS).default("medium"),
    enabledQuestionTypes: z
      .array(z.enum(QUESTION_TYPES))
      .min(1, "Enable at least one question type")
      .max(QUESTION_TYPES.length),
    durationMinutes: z.coerce.number().int().min(1).max(480),
    questionCountMode: z.enum(QUESTION_COUNT_MODES).default("fixed"),
    questionCount: z.coerce.number().int().min(1).max(100),
    skills: z.array(z.string().trim().min(1)).min(1, "Select at least one skill").max(40),
    passingCriteria: PassingCriteriaSchema,
    antiCheat: AntiCheatSchema,
    coding: CodingSettingsSchema,
    isPublished: z.boolean().optional(),
  })
  .superRefine((cfg, ctx) => {
    // If coding is disabled overall, mandating it would be unreachable.
    const codingEnabled =
      cfg.enabledQuestionTypes.includes("coding") || cfg.enabledQuestionTypes.includes("sql");
    if (!codingEnabled && cfg.coding.languages.length === 0) {
      // Allowed — schema just won't surface a language picker.
    }
    for (const m of cfg.passingCriteria.mandatoryTypes) {
      if (!cfg.enabledQuestionTypes.includes(m)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["passingCriteria", "mandatoryTypes"],
          message: `Cannot require "${m}" — it's not enabled.`,
        });
      }
    }
    for (const sm of cfg.passingCriteria.sectionMinimums) {
      if (!cfg.enabledQuestionTypes.includes(sm.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["passingCriteria", "sectionMinimums"],
          message: `Cannot set minimum for "${sm.type}" — it's not enabled.`,
        });
      }
    }
  });

export type AssessmentConfigInput = z.infer<typeof AssessmentConfigUpsertSchema>;
