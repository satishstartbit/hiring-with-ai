"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  RegisterCompanySchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../lib/validation/auth";
import { connectDB } from "../lib/db/connection";
import { Company } from "../lib/db/models/Company";
import { User } from "../lib/db/models/User";
import { Workspace } from "../lib/db/models/Workspace";
import { Branding } from "../lib/db/models/Branding";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { createSession, deleteSession } from "../lib/auth/session";
import { slugify, uniqueSuffix, randomToken } from "../lib/auth/slug";

export type FormState =
  | { ok?: false; errors?: Record<string, string[]>; message?: string }
  | undefined;

export async function registerCompany(_state: FormState, formData: FormData): Promise<FormState> {
  // Multi-step form submits state as a JSON payload field so all values arrive
  // even though only one step's inputs are mounted at a time.
  const payloadRaw = formData.get("payload");
  let payload: Record<string, unknown> = {};
  if (typeof payloadRaw === "string" && payloadRaw.length) {
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      return { message: "Invalid form submission" };
    }
  }

  const parsed = RegisterCompanySchema.safeParse({
    companyName: payload.companyName ?? formData.get("companyName"),
    companyDomain: payload.companyDomain ?? formData.get("companyDomain"),
    companyEmail: payload.companyEmail ?? formData.get("companyEmail"),
    adminName: payload.adminName ?? formData.get("adminName"),
    password: payload.password ?? formData.get("password"),
    logoUrl: payload.logoUrl ?? formData.get("logoUrl") ?? "",
    companySize: payload.companySize ?? formData.get("companySize"),
    industry: payload.industry ?? formData.get("industry"),
    country: payload.country ?? formData.get("country"),
    timezone: payload.timezone ?? formData.get("timezone"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  await connectDB();

  const [existingUser, existingCompany] = await Promise.all([
    User.findOne({ email: data.companyEmail }).lean(),
    Company.findOne({ domain: data.companyDomain }).lean(),
  ]);
  if (existingUser) {
    return { errors: { companyEmail: ["An account with this email already exists"] } };
  }
  if (existingCompany) {
    return { errors: { companyDomain: ["This domain is already registered"] } };
  }

  const company = await Company.create({
    name: data.companyName,
    domain: data.companyDomain,
    email: data.companyEmail,
    logoUrl: data.logoUrl || "",
    size: data.companySize,
    industry: data.industry,
    country: data.country,
    timezone: data.timezone,
  });

  let slugBase = slugify(data.companyName);
  let slug = slugBase;
  let attempts = 0;
  while (await Workspace.findOne({ slug }).lean()) {
    slug = `${slugBase}-${uniqueSuffix()}`;
    if (++attempts > 5) {
      slug = `${slugBase}-${uniqueSuffix()}${uniqueSuffix()}`;
      break;
    }
  }

  const passwordHash = await hashPassword(data.password);
  const verifyToken = randomToken();

  const user = await User.create({
    email: data.companyEmail,
    passwordHash,
    name: data.adminName,
    role: "company_admin",
    companyId: company._id,
    workspaceId: null,
    emailVerified: false,
    emailVerifyToken: verifyToken,
    emailVerifyTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const workspace = await Workspace.create({
    name: data.companyName,
    slug,
    companyId: company._id,
    ownerId: user._id,
    memberCount: 1,
  });

  const branding = await Branding.create({
    workspaceId: workspace._id,
    companyId: company._id,
    logoUrl: data.logoUrl || "",
    primaryColor: "#4f46e5",
    accentColor: "#a855f7",
  });

  workspace.brandingId = branding._id;
  await workspace.save();

  user.workspaceId = workspace._id;
  await user.save();

  company.primaryWorkspaceId = workspace._id;
  await company.save();

  await createSession({
    userId: String(user._id),
    companyId: String(company._id),
    workspaceId: String(workspace._id),
    workspaceSlug: workspace.slug,
    role: user.role,
    email: user.email,
  });

  redirect("/dashboard?welcome=1");
}

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  await connectDB();
  const user = await User.findOne({ email: parsed.data.email, deletedAt: null });
  if (!user) {
    return { message: "Invalid email or password" };
  }
  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return { message: "Invalid email or password" };
  }
  const workspace = await Workspace.findOne({ _id: user.workspaceId, deletedAt: null }).lean();
  if (!workspace) {
    return { message: "Workspace unavailable. Contact support." };
  }
  user.lastLoginAt = new Date();
  await user.save();
  await createSession({
    userId: String(user._id),
    companyId: String(user.companyId),
    workspaceId: String(user.workspaceId),
    workspaceSlug: workspace.slug,
    role: user.role,
    email: user.email,
  });
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await deleteSession();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function forgotPasswordAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = ForgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  await connectDB();
  const user = await User.findOne({ email: parsed.data.email, deletedAt: null });
  if (user) {
    user.passwordResetToken = randomToken();
    user.passwordResetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    // TODO: send email with link /reset-password?token=<token>
    // Email delivery is wired in app/lib/email.ts; integrate in a follow-up.
  }
  return { message: "If that account exists, a reset link is on the way." };
}

export async function resetPasswordAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  await connectDB();
  const user = await User.findOne({
    passwordResetToken: parsed.data.token,
    passwordResetTokenExpiresAt: { $gt: new Date() },
    deletedAt: null,
  });
  if (!user) return { message: "Reset link is invalid or expired" };
  user.passwordHash = await hashPassword(parsed.data.password);
  user.passwordResetToken = null;
  user.passwordResetTokenExpiresAt = null;
  await user.save();
  redirect("/login?reset=1");
}

export async function verifyEmailAction(token: string): Promise<{ ok: boolean; message: string }> {
  await connectDB();
  const user = await User.findOne({
    emailVerifyToken: token,
    emailVerifyTokenExpiresAt: { $gt: new Date() },
    deletedAt: null,
  });
  if (!user) return { ok: false, message: "Verification link is invalid or expired" };
  user.emailVerified = true;
  user.emailVerifyToken = null;
  user.emailVerifyTokenExpiresAt = null;
  await user.save();
  return { ok: true, message: "Email verified successfully" };
}
