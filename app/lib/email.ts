import nodemailer from "nodemailer";

function createTransport() {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();

  console.log("[createTransport] EMAIL_USER:", user);
  console.log("[createTransport] EMAIL_PASS:", pass);
  if (!user || !pass) {
    throw new Error(
      `Email env vars missing: EMAIL_USER=${user ? "set" : "missing"}, EMAIL_PASS=${pass ? "set" : "missing"}`
    );
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
}

const FROM = process.env.EMAIL_FROM ?? `Hiring Team <sam2021choudhary2021@gmail.com>`;

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

  console.log("[sendResumeRejectedEmail] Sending resume rejected email to:", to, FROM);
  const sent = await transporter.sendMail({
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
  console.log(`[email] Resume rejected email sent to ${to}: ${sent.messageId}`, sent);

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

interface InterviewScheduledParams {
  to: string;
  candidateName: string;
  jobTitle: string;
  scheduledAt: Date;
  meetingUrl: string;
}

export async function sendInterviewScheduledEmail(params: InterviewScheduledParams) {
  const { to, candidateName, jobTitle, scheduledAt, meetingUrl } = params;
  const transporter = createTransport();
  const dateStr = scheduledAt.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `AI Interview Scheduled — ${jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
        <h2 style="font-size:18px;margin-bottom:4px">Hi ${candidateName},</h2>
        <p style="color:#475569;font-size:14px">Great news! You passed the screening test. Your AI video interview for <strong>${jobTitle}</strong> has been scheduled.</p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1d4ed8">INTERVIEW SCHEDULED FOR</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#1e40af">${dateStr}</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${meetingUrl}"
            style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.3px">
            Join AI Interview →
          </a>
          <p style="margin:10px 0 0;font-size:12px;color:#94a3b8">Or copy this link: ${meetingUrl}</p>
        </div>
        <p style="font-size:13px;color:#64748b">Tips for a great interview:</p>
        <ul style="font-size:13px;color:#475569;padding-left:18px;margin:6px 0 0">
          <li>Find a quiet, well-lit space</li>
          <li>Allow camera and microphone access when prompted</li>
          <li>Speak clearly — the AI listens to your voice</li>
          <li>Each answer should be 1–3 minutes</li>
        </ul>
        <p style="font-size:14px;color:#475569;margin-top:20px">Best regards,<br/>The Hiring Team</p>
      </div>
    `,
  });
}

interface InterviewResultParams {
  to: string;
  candidateName: string;
  jobTitle: string;
  totalScore: number;
  overallFeedback: string;
  questions: string[];
  questionScores: number[];
  questionFeedback: string[];
}

export async function sendInterviewResultEmail(params: InterviewResultParams) {
  const { to, candidateName, jobTitle, totalScore, overallFeedback, questions, questionScores, questionFeedback } = params;
  const passed = totalScore >= 70;
  const transporter = createTransport();

  const questionRows = questions
    .map((q, i) => `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:10px 8px;font-size:12px;color:#475569;vertical-align:top">${q}</td>
        <td style="padding:10px 8px;font-size:12px;font-weight:700;color:${(questionScores[i] ?? 0) >= 6 ? "#16a34a" : "#dc2626"};text-align:center;vertical-align:top">${questionScores[i] ?? 0}/10</td>
        <td style="padding:10px 8px;font-size:12px;color:#64748b;vertical-align:top">${questionFeedback[i] ?? ""}</td>
      </tr>`)
    .join("");

  await transporter.sendMail({
    from: FROM,
    to,
    subject: `AI Interview Result — ${jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#1e293b">
        <h2 style="font-size:18px;margin-bottom:4px">Hi ${candidateName},</h2>
        <p style="color:#475569;font-size:14px">Your AI mock interview for <strong>${jobTitle}</strong> is complete. Here are your results.</p>
        <div style="background:${passed ? "#f0fdf4" : "#fef2f2"};border:1px solid ${passed ? "#bbf7d0" : "#fecaca"};border-radius:8px;padding:16px;margin:20px 0;text-align:center">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${passed ? "#166534" : "#991b1b"}">
            ${passed ? "CONGRATULATIONS — INTERVIEW PASSED" : "INTERVIEW SCORE"}
          </p>
          <p style="margin:0;font-size:36px;font-weight:700;color:${passed ? "#16a34a" : "#dc2626"}">${totalScore}/100</p>
          <p style="margin:10px 0 0;font-size:13px;color:#475569">${overallFeedback}</p>
        </div>
        <h3 style="font-size:14px;font-weight:700;color:#334155;margin-bottom:8px">Question Breakdown</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#64748b;text-align:left">Question</th>
              <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#64748b;text-align:center">Score</th>
              <th style="padding:10px 8px;font-size:11px;font-weight:700;color:#64748b;text-align:left">Feedback</th>
            </tr>
          </thead>
          <tbody>${questionRows}</tbody>
        </table>
        ${passed
          ? `<p style="font-size:14px;color:#475569;margin-top:16px">Our team will be in touch with next steps shortly. Well done!</p>`
          : `<p style="font-size:14px;color:#475569;margin-top:16px">We appreciate your effort and encourage you to apply for future openings.</p>`
        }
        <p style="font-size:14px;color:#475569">Best regards,<br/>The Hiring Team</p>
      </div>
    `,
  });
}
