import { Resend } from 'resend';
import {
  APP_NAME,
  DEFAULT_EMAIL_SENDER,
  EMAIL_FOOTER_LOGO,
  EMAIL_PROFILE_PICTURE,
  SERVER_URL,
  VERIFIED_EMAIL_SENDERS,
} from '@/lib/constants';
import { Order } from '@/types';
import PurchaseReceiptEmail from './purchase-receipt';
import CompanyInviteEmail from './company-invite';

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  throw new Error('RESEND_API_KEY is not configured');
}

const resend = new Resend(apiKey);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const emailProfilePicture = EMAIL_PROFILE_PICTURE?.trim()
  ? EMAIL_PROFILE_PICTURE
  : `${SERVER_URL.replace(/\/$/, '')}/assets/logo.png`;
const emailFooterLogo = EMAIL_FOOTER_LOGO?.trim()
  ? EMAIL_FOOTER_LOGO
  : `${SERVER_URL.replace(/\/$/, '')}/assets/exented_logo.png`;

const PRIMARY = "#324D7A";
const ACCENT = "#AFE2D4";
const BG = "#F2FBF8";
const BORDER = "#D8ECE7";

const buildEmailBody = (content: string) => {
  const escaped = escapeHtml(content).replace(/\r?\n/g, "<br/>");
  const host = SERVER_URL.replace(/^https?:\/\//, "");

  // Table-based layout for maximum email client compatibility.
  return `
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      Reglo
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}; margin:0; padding:0; width:100%;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; border:1px solid ${BORDER}; border-radius:28px; overflow:hidden; background:#ffffff;">
            <tr>
              <td style="background:${PRIMARY}; padding:18px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle">
                      <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${emailProfilePicture}" width="36" height="36" alt="Reglo" style="display:block; border-radius:999px; background:${ACCENT};" />
                        <div style="color:#ffffff;">
                          <div style="font-size:14px; font-weight:700; letter-spacing:0.02em;">Reglo</div>
                          <div style="font-size:12px; opacity:0.9;">Automations & Docs</div>
                        </div>
                      </div>
                    </td>
                    <td valign="middle" align="right">
                      <span style="display:inline-block; background:${ACCENT}; color:${PRIMARY}; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; padding:8px 12px; border-radius:999px;">
                        Update
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; color:${PRIMARY}; font-size:16px; line-height:1.7;">
                ${escaped}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <div style="height:1px; background:${BORDER}; margin:0 0 18px 0;"></div>
                <div style="text-align:center;">
                  <img
                    src="${emailFooterLogo}"
                    alt="Reglo"
                    width="400"
                    height="108"
                    style="display:block; width:100%; height:auto; object-fit:contain; margin:0 auto 10px auto;"
                  />
                  <div style="font-size:13px; font-weight:700; letter-spacing:0.04em; color:${PRIMARY};">
                    Reglo · Automations & Docs
                  </div>
                  <div style="margin-top:6px; font-size:13px; color:#4B5F7A;">
                    <a href="${SERVER_URL}" style="color:${PRIMARY}; text-decoration:none; font-weight:600;">${host}</a>
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:${ACCENT}; padding:14px 24px; text-align:center; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; color:${PRIMARY}; font-size:12px; line-height:1.5;">
                Se non ti aspettavi questa email, puoi ignorarla.
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
  await resend.emails.send({
    from: formatSender(from),
    to,
    subject,
    html: buildEmailBody(body),
  });
};

export const sendPurchaseReceipt = async ({ order }: { order: Order }) => {
  await resend.emails.send({
    from: formatSender(DEFAULT_EMAIL_SENDER),
    to: order.user.email,
    subject: `Order Confirmation ${order.id}`,
    react: <PurchaseReceiptEmail order={order} />,
  });
};

export const sendCompanyInviteEmail = async ({
  to,
  companyName,
  inviteUrl,
  invitedByName,
}: {
  to: string;
  companyName: string;
  inviteUrl: string;
  invitedByName?: string | null;
}) => {
  await resend.emails.send({
    from: formatSender(DEFAULT_EMAIL_SENDER),
    to,
    subject: `You have been invited to join ${companyName}`,
    react: (
      <CompanyInviteEmail
        companyName={companyName}
        inviteUrl={inviteUrl}
        invitedByName={invitedByName}
      />
    ),
  });
};

export const getVerifiedEmailSenders = () => VERIFIED_EMAIL_SENDERS;
