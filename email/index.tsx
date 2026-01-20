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

const buildEmailBody = (content: string) => {
  const escaped = escapeHtml(content).replace(/\r?\n/g, '<br/>');
  return `
    <div style="font-family: Inter,-apple-system,system-ui, sans-serif; color: #111827; padding: 32px 0; display: flex; justify-content: center;">
      <div style="width: 100%; max-width: 460px; background: #ffffff; border-radius: 24px; padding: 32px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);">
        <div style="margin-bottom: 24px; font-size: 16px; line-height: 1.6;">
          ${escaped}
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <img
            src="${emailFooterLogo}"
            alt="Reglo extended logo"
            width="400"
            height="108"
            style="display: block; width: 100%; height: auto; object-fit: contain; margin: 0;"
          />
          <p style="margin: 12px 0 4px; font-weight: 600; letter-spacing: 0.05em;">
            Reglo · Automations & Docs
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 13px;">
            <a href="${SERVER_URL}" style="color: #2563eb; text-decoration: none;">${SERVER_URL.replace(/^https?:\/\//, '')}</a>
          </p>
        </div>
      </div>
    </div>
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
