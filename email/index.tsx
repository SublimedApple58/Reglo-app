import { Resend } from 'resend';
import {
  APP_NAME,
  DEFAULT_EMAIL_SENDER,
  SERVER_URL,
  VERIFIED_EMAIL_SENDERS,
} from '@/lib/constants';
import CompanyInviteEmail from './company-invite';

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const baseUrl = SERVER_URL.replace(/\/$/, '');
const logoFullUrl = `${baseUrl}/images/reglo_logo_full.png`;
const logoIconUrl = `${baseUrl}/images/reglo_new_logo.png`;

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

const buildEmailBody = (content: string) => {
  const escaped = escapeHtml(content).replace(/\r?\n/g, "<br/>");

  return `
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">Reglo</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF; margin:0; padding:0; width:100%;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:480px;">
            <tr>
              <td style="padding:0 0 28px;">
                <img src="${logoFullUrl}" width="140" height="38" alt="Reglo" style="display:block; width:140px; height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="font-family:${FONT_STACK}; color:#1E293B; font-size:15px; line-height:1.7;">
                ${escaped}
              </td>
            </tr>
            <tr>
              <td style="padding:32px 0 0;">
                <div style="height:1px; background:#F1F5F9; margin:0 0 16px;"></div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="padding-right:8px;">
                      <img src="${logoIconUrl}" width="20" height="20" alt="" style="display:block; border-radius:4px;" />
                    </td>
                    <td valign="middle" style="font-family:${FONT_STACK}; font-size:12px; color:#94A3B8;">
                      <a href="${SERVER_URL}" style="color:#94A3B8; text-decoration:none;">reglo.it</a> · La tua autoscuola, semplice.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
};

const formatSender = (from?: string) =>
  from?.trim() ? `${APP_NAME} <${from.trim()}>` : `${APP_NAME} <${DEFAULT_EMAIL_SENDER}>`;

export const sendDynamicEmail = async ({
  to,
  subject,
  body,
  from,
}: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}) => {
  const resend = getResend();
  await resend.emails.send({
    from: formatSender(from),
    to,
    subject,
    html: buildEmailBody(body),
  });
};

export const sendCompanyInviteEmail = async ({
  to,
  companyName,
  inviteUrl,
  mobileInviteUrl,
  invitedByName,
}: {
  to: string;
  companyName: string;
  inviteUrl: string;
  mobileInviteUrl?: string | null;
  invitedByName?: string | null;
}) => {
  const resend = getResend();
  await resend.emails.send({
    from: formatSender(DEFAULT_EMAIL_SENDER),
    to,
    subject: `You have been invited to join ${companyName}`,
    react: (
      <CompanyInviteEmail
        companyName={companyName}
        inviteUrl={inviteUrl}
        mobileInviteUrl={mobileInviteUrl}
        invitedByName={invitedByName}
      />
    ),
  });
};

export const getVerifiedEmailSenders = () => VERIFIED_EMAIL_SENDERS;
