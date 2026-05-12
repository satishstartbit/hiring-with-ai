import nodemailer from "nodemailer";

export interface OutreachEmailData {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  department: string;
  jobDescription: string;
  companyName?: string;
}

export interface TeamInviteEmailData {
  inviteeName: string;
  inviteeEmail: string;
  inviteeRoleLabel: string;
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
  expiresAt: Date;
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function emailConfigured(): boolean {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function defaultFrom(): string {
  return process.env.EMAIL_FROM || `"HireAI" <${process.env.EMAIL_USER || "no-reply@hireai.local"}>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendTeamInviteEmail(
  data: TeamInviteEmailData
): Promise<{ success: boolean; stubbed: boolean; messageId?: string; error?: string }> {
  const subject = `You've been invited to ${data.workspaceName} on HireAI`;
  const expires = data.expiresAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (!emailConfigured()) {
    console.log(
      `[EMAIL STUB] Would send team invite to ${data.inviteeEmail} (${data.inviteeRoleLabel}) — link: ${data.inviteUrl}`
    );
    return { success: true, stubbed: true };
  }

  try {
    const transport = createTransport();
    const safeName = escapeHtml(data.inviteeName);
    const safeInviter = escapeHtml(data.inviterName);
    const safeWorkspace = escapeHtml(data.workspaceName);
    const safeRole = escapeHtml(data.inviteeRoleLabel);
    const safeUrl = escapeHtml(data.inviteUrl);

    const result = await transport.sendMail({
      from: defaultFrom(),
      to: data.inviteeEmail,
      subject,
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h2 style="margin:0 0 12px">You're invited to join ${safeWorkspace}</h2>
          <p>Hi ${safeName},</p>
          <p>${safeInviter} invited you to join <strong>${safeWorkspace}</strong> on HireAI as a <strong>${safeRole}</strong>.</p>
          <p>Click the button below to set your password and finish signing in:</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}"
               style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">
              Accept invite & set password
            </a>
          </p>
          <p style="color:#475569;font-size:13px">
            Or copy this link into your browser:<br/>
            <span style="word-break:break-all">${safeUrl}</span>
          </p>
          <p style="color:#475569;font-size:13px">
            This invite link expires on ${expires}.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="color:#94a3b8;font-size:12px">
            If you weren't expecting this email, you can ignore it.
          </p>
        </div>
      `,
      text:
        `Hi ${data.inviteeName},\n\n` +
        `${data.inviterName} invited you to join ${data.workspaceName} on HireAI as ${data.inviteeRoleLabel}.\n\n` +
        `Set your password here: ${data.inviteUrl}\n\n` +
        `This link expires on ${expires}.`,
    });

    return { success: true, stubbed: false, messageId: result.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown email error";
    console.error("[sendTeamInviteEmail] failed:", msg);
    return { success: false, stubbed: false, error: msg };
  }
}

export async function sendOutreachEmail(
  data: OutreachEmailData
): Promise<{ messageId: string; success: boolean }> {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    // Development stub
    console.log(
      `[EMAIL STUB] Would send outreach to ${data.candidateEmail} for ${data.jobTitle}`
    );
    return { messageId: `stub_${Date.now()}`, success: true };
  }

  const transport = createTransport();
  const from = process.env.EMAIL_FROM || `"Hiring Team" <sam2021choudhary2021@gmail.com>`;

  const result = await transport.sendMail({
    from,
    to: data.candidateEmail,
    subject: `Exciting ${data.jobTitle} opportunity at ${data.companyName || "our company"}`,
    html: `
      <p>Hi ${data.candidateName},</p>
      <p>I came across your profile and was impressed by your background.
         We're hiring for a <strong>${data.jobTitle}</strong> role on our ${data.department} team.</p>
      <p>${data.jobDescription.slice(0, 300)}...</p>
      <p>Would you be open to a quick chat? Looking forward to connecting.</p>
      <p>Best regards,<br/>The Hiring Team</p>
    `,
  });

  return { messageId: result.messageId, success: true };
}
