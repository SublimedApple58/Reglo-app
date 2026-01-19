'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { formatError } from '@/lib/utils';
import {
  createImageUploadSchema,
  finalizeImageUploadSchema,
} from '@/lib/validators';
import {
  getR2Bucket,
  getR2Client,
  getSignedAssetUrl,
} from '@/lib/storage/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UPLOAD_URL_TTL = 60;

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const companyLogoUploadSchema = createImageUploadSchema.extend({
  companyId: z.string().min(1, 'Company is required'),
});

const companyLogoFinalizeSchema = finalizeImageUploadSchema.extend({
  companyId: z.string().min(1, 'Company is required'),
});

export async function createUserAvatarUpload(
  input: z.infer<typeof createImageUploadSchema>
) {
  try {
    const payload = createImageUploadSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    validateImagePayload(payload);

    const extension = resolveImageExtension(payload.contentType);
    const key = `users/${userId}/avatar-${randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        ContentType: payload.contentType,
      }),
      { expiresIn: UPLOAD_URL_TTL }
    );

    return { success: true, data: { uploadUrl, key } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function saveUserAvatar(
  input: z.infer<typeof finalizeImageUploadSchema>
) {
  try {
    const payload = finalizeImageUploadSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    if (!payload.key.startsWith(`users/${userId}/`)) {
      throw new Error('Invalid asset key');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { image: payload.key },
    });

    const url = await getSignedAssetUrl(payload.key);

    return {
      success: true,
      data: { key: payload.key, url },
      message: 'Profile image updated successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getCurrentUserAvatarUrl() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { image: true },
    });

    if (!user?.image) {
      return { success: true, data: { url: null } };
    }

    const url = await getSignedAssetUrl(user.image);
    return { success: true, data: { url } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function createCompanyLogoUpload(
  input: z.infer<typeof companyLogoUploadSchema>
) {
  try {
    const payload = companyLogoUploadSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: payload.companyId },
    });

    if (!membership) {
      throw new Error('User is not authorized for this company');
    }

    if (membership.role !== 'admin') {
      throw new Error('Only admins can update company logo');
    }

    validateImagePayload(payload);

    const extension = resolveImageExtension(payload.contentType);
    const key = `companies/${payload.companyId}/logo-${randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        ContentType: payload.contentType,
      }),
      { expiresIn: UPLOAD_URL_TTL }
    );

    return { success: true, data: { uploadUrl, key } };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function saveCompanyLogo(
  input: z.infer<typeof companyLogoFinalizeSchema>
) {
  try {
    const payload = companyLogoFinalizeSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: payload.companyId },
    });

    if (!membership) {
      throw new Error('User is not authorized for this company');
    }

    if (membership.role !== 'admin') {
      throw new Error('Only admins can update company logo');
    }

    if (!payload.key.startsWith(`companies/${payload.companyId}/`)) {
      throw new Error('Invalid asset key');
    }

    await prisma.company.update({
      where: { id: payload.companyId },
      data: { logoKey: payload.key },
    });

    const url = await getSignedAssetUrl(payload.key);

    return {
      success: true,
      data: { key: payload.key, url },
      message: 'Company logo updated successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

const validateImagePayload = (
  payload: z.infer<typeof createImageUploadSchema>
) => {
  if (payload.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Max size is 5MB.');
  }

  if (!IMAGE_TYPES[payload.contentType]) {
    throw new Error('Unsupported image type.');
  }
};

const resolveImageExtension = (contentType: string) => {
  const extension = IMAGE_TYPES[contentType];
  if (!extension) {
    throw new Error('Unsupported image type.');
  }
  return extension;
};
