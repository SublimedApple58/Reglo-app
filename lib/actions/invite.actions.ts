'use server';

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { sendCompanyInviteEmail } from '@/email';
import { routing } from '@/i18n/routing';
import { SERVER_URL } from '@/lib/constants';
import { formatError } from '@/lib/utils';
import {
  acceptCompanyInviteSchema,
  createCompanyInviteSchema,
} from '@/lib/validators';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const INVITE_TTL_DAYS = 7;

export async function createCompanyInvite(
  input: z.infer<typeof createCompanyInviteSchema>
) {
  try {
    const payload = createCompanyInviteSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;
    const isGlobalAdmin = session?.user?.role === 'admin';

    if (!userId) {
      throw new Error('User is not authenticated');
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: payload.companyId },
      include: { company: true },
    });

    if (!membership) {
      throw new Error('User is not authorized for this company');
    }

    if (!isGlobalAdmin && membership.role !== 'admin') {
      throw new Error('Only admins can invite users');
    }

    const email = payload.email.trim().toLowerCase();

    const existingMember = await prisma.companyMember.findFirst({
      where: {
        companyId: payload.companyId,
        user: { email },
      },
    });

    if (existingMember) {
      throw new Error('User already belongs to this company');
    }

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    const existingInvite = await prisma.companyInvite.findFirst({
      where: {
        companyId: payload.companyId,
        email,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    const invite = existingInvite
      ? await prisma.companyInvite.update({
          where: { id: existingInvite.id },
          data: { role: payload.role, expiresAt },
        })
      : await prisma.companyInvite.create({
          data: {
            companyId: payload.companyId,
            email,
            role: payload.role,
            token: randomUUID(),
            status: 'pending',
            expiresAt,
            invitedById: userId,
          },
        });

    const inviteUrl = `${SERVER_URL}/${routing.defaultLocale}/invite/${invite.token}`;

    await sendCompanyInviteEmail({
      to: email,
      companyName: membership.company.name,
      inviteUrl,
      invitedByName: session?.user?.name ?? null,
    });

    return {
      success: true,
      message: 'Invite sent successfully',
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function getCompanyInvite(
  input: z.infer<typeof acceptCompanyInviteSchema>
) {
  try {
    const payload = acceptCompanyInviteSchema.parse(input);
    const session = await auth();
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      throw new Error('User is not authenticated');
    }

    const invite = await prisma.companyInvite.findUnique({
      where: { token: payload.token },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer active');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    if (invite.email.toLowerCase() !== userEmail) {
      throw new Error('Invite email does not match the signed-in user');
    }

    return {
      success: true,
      data: {
        companyName: invite.company.name,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function acceptCompanyInvite(
  input: z.infer<typeof acceptCompanyInviteSchema>
) {
  try {
    const payload = acceptCompanyInviteSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userId || !userEmail) {
      throw new Error('User is not authenticated');
    }

    const invite = await prisma.companyInvite.findUnique({
      where: { token: payload.token },
      include: { company: true },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer active');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    if (invite.email.toLowerCase() !== userEmail) {
      throw new Error('Invite email does not match the signed-in user');
    }

    const existingMember = await prisma.companyMember.findFirst({
      where: { companyId: invite.companyId, userId },
    });

    if (!existingMember) {
      await prisma.companyMember.create({
        data: {
          companyId: invite.companyId,
          userId,
          role: invite.role,
        },
      });
    }

    await prisma.companyInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted' },
    });

    return {
      success: true,
      message: `You joined ${invite.company.name}`,
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
