/**
 * Staff account invitation — a separate, small template from templates.ts's
 * patient-facing set on purpose: those all require an unsubscribeUrl and
 * route through sendTriggerEmail's DND-gated, conversation-logging pattern,
 * neither of which applies to an internal staff account email. Sent
 * directly via getEmailProvider("system") instead.
 */

export interface RenderedStaffInviteEmail {
  readonly subject: string;
  readonly html: string;
}

const ROLE_LABEL: Record<"admin" | "manager" | "employee", string> = {
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

export function renderStaffInvitationEmail(
  firstName: string,
  role: "admin" | "manager" | "employee",
  inviteUrl: string,
): RenderedStaffInviteEmail {
  const name = firstName.trim() || "there";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You've been invited to Genesis Health</title>
<style>
  body, table, td { font-family: Arial, Helvetica, sans-serif; }
  body { margin: 0; padding: 0; background-color: #f1f5f4; }
  .email-wrapper { width: 100%; background-color: #f1f5f4; padding: 40px 0; }
  .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #dde5e3; }
  .header { background-color: #12312b; padding: 32px 40px; text-align: center; }
  .logo-text { font-size: 24px; letter-spacing: 2px; color: #ffffff; margin: 0; font-weight: 700; }
  .header-sub { font-size: 11px; letter-spacing: 2px; color: #a9c2bc; text-transform: uppercase; margin-top: 6px; }
  .body-content { padding: 44px 40px 20px 40px; }
  .greeting { font-size: 22px; color: #12312b; margin: 0 0 22px 0; font-weight: 700; }
  .paragraph { font-size: 15px; line-height: 26px; color: #3f4a47; margin: 0 0 20px 0; }
  .cta-wrapper { text-align: center; margin: 32px 0; }
  .cta-button { display: inline-block; background-color: #0d9488; color: #ffffff; font-size: 15px; font-weight: bold; letter-spacing: 0.5px; text-decoration: none; padding: 16px 38px; border-radius: 4px; text-transform: uppercase; }
  .divider { border: none; border-top: 1px solid #dde5e3; margin: 30px 0; }
  .footer { padding: 28px 40px 40px 40px; text-align: center; }
  .footer-text { font-size: 12px; line-height: 20px; color: #7c8a86; margin: 4px 0; }
  a { color: #0d9488; }
</style>
</head>
<body>
<div class="email-wrapper">
  <table class="email-container" role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="header">
        <p class="logo-text">GENESIS HEALTH</p>
        <p class="header-sub">Staff Dashboard</p>
      </td>
    </tr>
    <tr>
      <td class="body-content">
        <p class="greeting">Hi ${name},</p>
        <p class="paragraph">You've been invited to join the Genesis Health staff dashboard as <strong>${ROLE_LABEL[role]}</strong>. Click below to set your password and get started.</p>
        <div class="cta-wrapper">
          <a href="${inviteUrl}" class="cta-button">Accept Invitation</a>
        </div>
        <p class="paragraph">This link expires in 24 hours. If you weren't expecting this invitation, you can safely ignore this email.</p>
      </td>
    </tr>
    <tr>
      <td><hr class="divider" style="margin-left:40px; margin-right:40px;"></td>
    </tr>
    <tr>
      <td class="footer">
        <p class="footer-text">Genesis Health</p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;
  return { subject: "You've been invited to Genesis Health", html };
}
