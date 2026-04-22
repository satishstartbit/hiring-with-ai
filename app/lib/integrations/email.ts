import nodemailer from "nodemailer";

export interface OutreachEmailData {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  department: string;
  jobDescription: string;
  companyName?: string;
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
