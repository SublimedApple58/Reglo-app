import { Resend } from 'resend';
import { SENDER_EMAIL, APP_NAME } from '@/lib/constants';
import { Order } from '@/types';
import dotenv from 'dotenv';
dotenv.config();

import PurchaseReceiptEmail from './purchase-receipt';
import CompanyInviteEmail from './company-invite';

const resend = new Resend(process.env.RESEND_API_KEY as string);

export const sendPurchaseReceipt = async ({ order }: { order: Order }) => {
  await resend.emails.send({
    from: `${APP_NAME} <${SENDER_EMAIL}>`,
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
    from: `${APP_NAME} <${SENDER_EMAIL}>`,
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
