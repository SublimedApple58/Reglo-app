import { z } from 'zod';
import { formatNumberWithDecimal } from './utils';
import { PAYMENT_METHODS } from './constants';

const currency = z
  .string()
  .refine(
    (value) => /^\d+(\.\d{2})?$/.test(formatNumberWithDecimal(Number(value))),
    'Price must have exactly two decimal places'
  );

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

// Schema for payment method
export const paymentMethodSchema = z
  .object({
    type: z.string().min(1, 'Payment method is required'),
  })
  .refine((data) => PAYMENT_METHODS.includes(data.type), {
    path: ['type'],
    message: 'Invalid payment method',
  });

// Schema for inserting order
export const insertOrderSchema = z.object({
  userId: z.string().min(1, 'User is required'),
  itemsPrice: currency,
  shippingPrice: currency,
  taxPrice: currency,
  totalPrice: currency,
  paymentMethod: z.string().refine((data) => PAYMENT_METHODS.includes(data), {
    message: 'Invalid payment method',
  }),
});

// Schema for inserting an order item
export const insertOrderItemSchema = z.object({
  productId: z.string(),
  slug: z.string(),
  image: z.string(),
  name: z.string(),
  price: currency,
  qty: z.number(),
});

// Schema for the PayPal paymentResult
export const paymentResultSchema = z.object({
  id: z.string(),
  status: z.string(),
  email_address: z.string(),
  pricePaid: z.string(),
});

// Schema for updating the user profile
export const updateProfileSchema = z.object({
  name: z.string().min(3, 'Name must be at leaast 3 characters'),
  email: z.string().min(3, 'Email must be at leaast 3 characters'),
});

// Schema to update users
export const updateUserSchema = updateProfileSchema.extend({
  id: z.string().min(1, 'ID is required'),
  role: z.enum(['member', 'admin']),
});

export const documentFieldSchema = z.object({
  type: z.string().min(1, 'Field type is required'),
  label: z.string().optional(),
  bindingKey: z.string().optional(),
  page: z.number().int().min(1, 'Page must be at least 1'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  meta: z.unknown().optional(),
});

export const createDocumentTemplateSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  name: z.string().min(1, 'Name is required'),
  sourceUrl: z.string().optional(),
});

export const saveDocumentFieldsSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  templateId: z.string().min(1, 'Template is required'),
  fields: z.array(documentFieldSchema),
});

export const getDocumentConfigSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  templateId: z.string().min(1, 'Template is required'),
});

export const createDocumentRequestSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  templateId: z.string().min(1, 'Template is required'),
  name: z.string().min(1, 'Name is required'),
});

export const workflowTriggerSchema = z.object({
  type: z.enum([
    'manual',
    'email_inbound',
    'document_completed',
    'slack_message',
    'fic_event',
  ]),
  config: z.record(z.unknown()).optional(),
});

export const workflowNodeSchema = z.object({
  id: z.string().min(1, 'Node id is required'),
  type: z.string().min(1, 'Node type is required'),
  config: z.record(z.unknown()).optional(),
});

export const workflowEdgeSchema = z.object({
  from: z.string().min(1, 'Edge source is required'),
  to: z.string().min(1, 'Edge target is required'),
  condition: z.record(z.unknown()).nullable().optional(),
});

export const workflowDefinitionSchema = z.object({
  trigger: workflowTriggerSchema,
  nodes: z.array(workflowNodeSchema).default([]),
  edges: z.array(workflowEdgeSchema).default([]),
  canvas: z
    .object({
      nodes: z.array(z.unknown()).default([]),
      edges: z.array(z.unknown()).default([]),
    })
    .optional(),
  settings: z
    .object({
      timezone: z.string().optional(),
      onError: z.enum(['stop', 'continue']).optional(),
      retryPolicy: z
        .object({
          maxAttempts: z.number().int().min(1).max(10).optional(),
          backoffSeconds: z.number().int().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

export const workflowStatusSchema = z.enum(['draft', 'active', 'paused']);

export const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  definition: workflowDefinitionSchema.optional(),
});

export const updateWorkflowSchema = z.object({
  id: z.string().min(1, 'Workflow id is required'),
  name: z.string().min(1).optional(),
  status: workflowStatusSchema.optional(),
  definition: workflowDefinitionSchema.optional(),
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
  role: z.enum(['member', 'admin']),
});

export const acceptCompanyInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
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
