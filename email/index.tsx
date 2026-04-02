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

const logoUrl = `${SERVER_URL.replace(/\/$/, '')}/images/R_logo.png`;

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

const buildEmailBody = (content: string) => {
  const escaped = escapeHtml(content).replace(/\r?\n/g, "<br/>");

  return `
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">Reglo</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC; margin:0; padding:0; width:100%;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:520px;">
            <tr>
              <td align="center" style="padding:0 0 28px;">
                <img src="${logoUrl}" width="44" height="44" alt="Reglo" style="display:block;" />
              </td>
            </tr>
            <tr>
              <td style="background:#FFFFFF; border-radius:16px; padding:32px 28px; font-family:${FONT_STACK}; color:#1E293B; font-size:15px; line-height:1.7;">
                ${escaped}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 0 0;">
                <div style="font-family:${FONT_STACK}; font-size:12px; color:#94A3B8;">
                  <a href="${SERVER_URL}" style="color:#94A3B8; text-decoration:none;">Reglo</a>
                </div>
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
