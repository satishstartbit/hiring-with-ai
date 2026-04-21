import nodemailer from "nodemailer";

function createTransport() {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();

  if (!user || !pass) {
    throw new Error(
      `Email env vars missing: EMAIL_USER=${user ? "set" : "missing"}, EMAIL_PASS=${pass ? "set" : "missing"}`
    );
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

const FROM = process.env.EMAIL_FROM ?? `Hiring Team <${process.env.EMAIL_USER}>`;

interface ResumeRejectedParams {
  to: string;
  candidateName: string;
  jobTitle: string;
  matchScore: number;
  matchReason: string;
}

export async function sendResumeRejectedEmail(params: ResumeRejectedParams) {
  const { to, candidateName, jobTitle, matchScore, matchReason } = params;
  const transporter = createTransport();
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Application Update — ${jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
        <h2 style="font-size:18px;margin-bottom:4px">Hi ${candidateName},</h2>
        <p style="color:#475569;font-size:14px">Thank you for your interest in the <strong>${jobTitle}</strong> position.</p>
        <p style="font-size:14px">After reviewing your resume, we determined that your profile is not a strong match for this role at this time.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#64748b">MATCH SCORE</p>
          <p style="margin:0;font-size:24px;font-weight:700;color:#dc2626">${matchScore}/100</p>
          <p style="margin:10px 0 0;font-size:13px;color:#475569">${matchReason}</p>
        </div>
        <p style="font-size:14px;color:#475569">We encourage you to apply again in the future if you feel your experience better aligns with an open role.</p>
        <p style="font-size:14px;color:#475569">Best regards,<br/>The Hiring Team</p>
      </div>
    `,
  });
}

interface ScreeningResultParams {
  to: string;
  candidateName: string;
  jobTitle: string;
  totalScore: number;
  overallFeedback?: string;
}

export async function sendScreeningResultEmail(params: ScreeningResultParams) {
  const { to, candidateName, jobTitle, totalScore, overallFeedback } = params;
  const passed = totalScore >= 70;
  const transporter = createTransport();
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Screening Result — ${jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
        <h2 style="font-size:18px;margin-bottom:4px">Hi ${candidateName},</h2>
        <p style="color:#475569;font-size:14px">Thank you for completing the AI screening test for the <strong>${jobTitle}</strong> position.</p>
        <div style="background:${passed ? "#f0fdf4" : "#fef2f2"};border:1px solid ${passed ? "#bbf7d0" : "#fecaca"};border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${passed ? "#166534" : "#991b1b"}">
            ${passed ? "CONGRATULATIONS — YOU PASSED" : "TEST NOT PASSED"}
          </p>
          <p style="margin:0;font-size:28px;font-weight:700;color:${passed ? "#16a34a" : "#dc2626"}">${totalScore}/100</p>
          ${overallFeedback ? `<p style="margin:10px 0 0;font-size:13px;color:#475569">${overallFeedback}</p>` : ""}
        </div>
        ${passed
          ? `<p style="font-size:14px;color:#475569">Our team will review your full application and reach out if there are next steps.</p>`
          : `<p style="font-size:14px;color:#475569">Unfortunately, a score of 70 or above is required to advance. We appreciate your effort and encourage you to apply for future openings.</p>`
        }
        <p style="font-size:14px;color:#475569">Best regards,<br/>The Hiring Team</p>
      </div>
    `,
  });
}
