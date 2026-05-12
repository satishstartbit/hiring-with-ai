import { NextRequest } from "next/server";
import { RegisterCompanySchema } from "@/app/lib/validation/auth";
import { connectDB } from "@/app/lib/db/connection";
import { Company } from "@/app/lib/db/models/Company";
import { User } from "@/app/lib/db/models/User";
import { Workspace } from "@/app/lib/db/models/Workspace";
import { Branding } from "@/app/lib/db/models/Branding";
import { hashPassword } from "@/app/lib/auth/password";
import { createSession } from "@/app/lib/auth/session";
import { slugify, uniqueSuffix, randomToken } from "@/app/lib/auth/slug";
import { ok, err, fromError } from "@/app/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RegisterCompanySchema.parse(body);
    await connectDB();

    const [existingUser, existingCompany] = await Promise.all([
      User.findOne({ email: parsed.companyEmail }).lean(),
      Company.findOne({ domain: parsed.companyDomain }).lean(),
    ]);
    if (existingUser) return err("email_taken", "Email already registered", 409);
    if (existingCompany) return err("domain_taken", "Domain already registered", 409);

    const company = await Company.create({
      name: parsed.companyName,
      domain: parsed.companyDomain,
      email: parsed.companyEmail,
      logoUrl: parsed.logoUrl || "",
      size: parsed.companySize,
      industry: parsed.industry,
      country: parsed.country,
      timezone: parsed.timezone,
    });

    const slugBase = slugify(parsed.companyName);
    let slug = slugBase;
    while (await Workspace.findOne({ slug }).lean()) {
      slug = `${slugBase}-${uniqueSuffix()}`;
    }

    const user = await User.create({
      email: parsed.companyEmail,
      passwordHash: await hashPassword(parsed.password),
      name: parsed.adminName,
      role: "company_admin",
      companyId: company._id,
      emailVerified: false,
      emailVerifyToken: randomToken(),
      emailVerifyTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const workspace = await Workspace.create({
      name: parsed.companyName,
      slug,
      companyId: company._id,
      ownerId: user._id,
      memberCount: 1,
    });

    const branding = await Branding.create({
      workspaceId: workspace._id,
      companyId: company._id,
      logoUrl: parsed.logoUrl || "",
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

    return ok({
      userId: String(user._id),
      workspaceId: String(workspace._id),
      workspaceSlug: workspace.slug,
    });
  } catch (e) {
    return fromError(e);
  }
}
