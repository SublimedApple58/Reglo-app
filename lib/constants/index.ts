export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Reglo';
export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'From draft to signature in just a few clicks: Reglo orchestrates your documents and delivers them wherever they’re needed.';
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

export const signInDefaultValues = {
  email: 'admin@example.com',
  password: '123456',
};

export const signUpDefaultValues = {
  companyName: '',
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export const PAYMENT_METHODS = process.env.PAYMENT_METHODS
  ? process.env.PAYMENT_METHODS.split(', ')
  : ['PayPal', 'Stripe', 'CashOnDelivery'];
export const DEFAULT_PAYMENT_METHOD =
  process.env.DEFAULT_PAYMENT_METHOD || 'PayPal';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  NO_ROLE = '',
}
export const USER_ROLES = Object.values(UserRole);

export const COMPANY_MEMBER_ROLES = ['admin', 'member'] as const;

export const DEFAULT_EMAIL_SENDER =
  process.env.DEFAULT_EMAIL_SENDER || 'no-reply@reglo.it';

const rawVerifiedSenders = process.env.VERIFIED_EMAIL_SENDERS ?? '';
const parsedVerifiedSenders = rawVerifiedSenders
  .split(',')
  .map((sender) => sender.trim())
  .filter(Boolean);
const allVerifiedSenders = parsedVerifiedSenders.length
  ? parsedVerifiedSenders
  : [DEFAULT_EMAIL_SENDER];
if (!allVerifiedSenders.includes(DEFAULT_EMAIL_SENDER)) {
  allVerifiedSenders.unshift(DEFAULT_EMAIL_SENDER);
}

export const VERIFIED_EMAIL_SENDERS = allVerifiedSenders;
export const SENDER_EMAIL = DEFAULT_EMAIL_SENDER;

export const EMAIL_FOOTER_LOGO = process.env.EMAIL_FOOTER_LOGO;
export const EMAIL_PROFILE_PICTURE = process.env.EMAIL_PROFILE_PICTURE;

export const publicRoutes = [
  '/sign-in',
  '/sign-up',
  '/unauthorized',
  '/not-found',
];

export const PAGE_SIZE = 20;
