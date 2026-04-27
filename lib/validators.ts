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
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
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
