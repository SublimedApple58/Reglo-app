import crypto from "crypto";

/**
 * Generates a 6-character uppercase hex invite code for a company.
 *
 * Lives outside `lib/actions/` because it must be importable from
 * `"use server"` files (which can only export async functions). It is a
 * pure, synchronous helper.
 */
export function generateInviteCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
}
