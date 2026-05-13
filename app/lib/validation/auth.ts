import { z } from "zod";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Must contain a letter")
  .regex(/[0-9]/, "Must contain a number");

export const RegisterCompanySchema = z.object({
  companyName: z.string().min(2, "Company name is too short").max(120).trim(),
  companyDomain: z
    .string()
    .min(3, "Enter a valid domain")
    .max(120)
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Use a domain like acme.com"),
  companyEmail: z.email("Enter a valid email").trim().toLowerCase(),
  adminName: z.string().min(2, "Your name is too short").max(120).trim(),
  password: passwordSchema,
  logoUrl: z.string().trim().optional().or(z.literal("")),
  companySize: z.enum(COMPANY_SIZES),
  industry: z.string().min(2, "Industry is required").max(80).trim(),
  country: z.string().min(2, "Country is required").max(80).trim(),
  timezone: z.string().min(2, "Timezone is required").max(80).trim(),
});

export type RegisterCompanyInput = z.infer<typeof RegisterCompanySchema>;

export const RegisterCandidateSchema = z.object({
  name: z.string().min(2, "Your name is too short").max(120).trim(),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: passwordSchema,
});

export type RegisterCandidateInput = z.infer<typeof RegisterCandidateSchema>;

export const LoginSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password required"),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const InviteMemberSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  name: z.string().min(2).max(120).trim(),
  role: z.enum(["company_admin", "recruiter", "hr_manager", "hiring_manager"]),
});

export const UpdateBrandingSchema = z.object({
  logoUrl: z.string().trim().optional().or(z.literal("")),
  faviconUrl: z.string().trim().optional().or(z.literal("")),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4f46e5")
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #a855f7")
    .optional(),
  emailHeader: z.string().max(200).optional(),
  emailFooter: z.string().max(400).optional(),
  careerPageTagline: z.string().max(200).optional(),
});
