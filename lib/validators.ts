import { z } from 'zod';

// Schema for signing users in
export const signInFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Schema for signing up a user
export const signUpFormSchema = z
  .object({
    companyName: z.string().min(1, 'Company name is required'),
    name: z.string().min(3, 'Name must be at least 3 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z
      .string()
      .min(6, 'Confirm password must be at least 6 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// Schema for student self-registration via school code
export const studentRegisterSchema = z
  .object({
    name: z.string().min(3, 'Name must be at least 3 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm password must be at least 6 characters'),
    schoolCode: z.string().length(6, 'School code must be exactly 6 characters'),
    phone: z.string().min(6, 'Phone number is required'),
    // REG-500: consenso agli avvisi di servizio su WhatsApp, dato in
    // registrazione. Le app precedenti non lo mandano: resta implicito.
    whatsappConsent: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// Schemas for the mobile self-service password reset (OTP via email)
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const passwordResetVerifySchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Code must be exactly 6 digits'),
});

export const passwordResetConfirmSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    code: z.string().length(6, 'Code must be exactly 6 digits'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm password must be at least 6 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// App: stesso flusso, ma il campo `email` accetta anche il telefono di chi
// accede col numero (lib/users/login-phone.ts). Il nome del campo resta
// `email` per compatibilità con le app già installate.
const resetIdentifier = z.string().trim().min(3, 'Inserisci email o telefono');

export const mobilePasswordResetRequestSchema = z.object({ email: resetIdentifier });

export const mobilePasswordResetVerifySchema = z.object({
  email: resetIdentifier,
  code: z.string().length(6, 'Code must be exactly 6 digits'),
});

export const mobilePasswordResetConfirmSchema = z
  .object({
    email: resetIdentifier,
    code: z.string().length(6, 'Code must be exactly 6 digits'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm password must be at least 6 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// «Primo accesso» dell'allievo creato col telefono (lib/auth/first-access.ts).
const isAdultishBirthDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return false;
  const years = (Date.now() - date.valueOf()) / (365.25 * 24 * 3600 * 1000);
  return years >= 14 && years <= 100;
};

export const firstAccessCompleteSchema = z.object({
  activationToken: z.string().min(10),
  firstName: z.string().trim().min(1, 'Scrivi il tuo nome'),
  lastName: z.string().trim().min(1, 'Scrivi il tuo cognome'),
  email: z.string().trim().email("Controlla l'email: non sembra valida"),
  password: z.string().min(6, 'La password deve avere almeno 6 caratteri'),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data di nascita non valida')
    .refine(isAdultishBirthDate, 'Controlla la data di nascita'),
});

// Schema for updating the user profile
export const updateProfileSchema = z.object({
  name: z.string().min(3, 'Name must be at leaast 3 characters'),
  email: z.string().min(3, 'Email must be at leaast 3 characters'),
});

// Schema to update users
export const updateUserSchema = updateProfileSchema.extend({
  id: z.string().min(1, 'ID is required'),
  autoscuolaRole: z.enum(['OWNER', 'INSTRUCTOR_OWNER', 'INSTRUCTOR', 'STUDENT']).optional(),
});

export const updateCompanyNameSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  name: z.string().min(1, 'Company name is required'),
});

export const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
});

export const createImageUploadSchema = z.object({
  contentType: z.string().min(1, 'Content type is required'),
  size: z.number().int().positive('File size is required'),
});

export const finalizeImageUploadSchema = z.object({
  key: z.string().min(1, 'Asset key is required'),
});

export const createCompanyInviteSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  email: z.string().email('Invalid email address'),
  autoscuolaRole: z.enum(['OWNER', 'INSTRUCTOR_OWNER', 'INSTRUCTOR', 'STUDENT']).optional(),
  platform: z.enum(['ios', 'android']).optional(),
});

export const acceptCompanyInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
});

export const resendCompanyInviteSchema = z.object({
  inviteId: z.string().min(1, 'Invite is required'),
});

export const cancelCompanyInviteSchema = z.object({
  inviteId: z.string().min(1, 'Invite is required'),
});

export const acceptCompanyInvitePasswordSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
  password: z.string().min(1, 'Password is required'),
});

export const acceptCompanyInviteSignUpSchema = z
  .object({
    token: z.string().min(1, 'Invite token is required'),
    name: z.string().min(1, 'Name is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm password is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
