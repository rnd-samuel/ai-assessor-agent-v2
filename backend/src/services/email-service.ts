import nodemailer from 'nodemailer';

// 1. Create the Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// 2. Define the Send Function
export const sendResetPasswordEmail = async (toEmail: string, resetToken: string) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Support" <support@example.com>',
    to: toEmail,
    subject: 'Reset Your Password - AI Assessor Agent',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #068c81;">Password Reset Request</h2>
        <p>You requested a password reset for your AI Assessor Agent account.</p>
        <p>Click the button below to set a new password. This link is valid for 1 hour.</p>
        <div style="margin: 20px 0;">
          <a href="${resetLink}" style="background-color: #068c81; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 12px; color: #666;">
          If you didn't ask to reset your password, you can safely ignore this email.
          <br />
          Or copy this link: <a href="${resetLink}">${resetLink}</a>
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent password reset to ${toEmail}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send password reset:', error);
    // We intentionally do not throw here to prevent crashing the auth flow,
    // but returning false allows the caller to decide how to handle it.
    return false;
  }
};