import { prisma } from "@/db/prisma";

export async function getOrCreateInstructorForUser({
  companyId,
  userId,
  name,
}: {
  companyId: string;
  userId: string;
  name: string;
}) {
  const existing = await prisma.autoscuolaInstructor.findFirst({
    where: { companyId, userId },
  });
  if (existing) return existing;

  const normalizedName = name.trim() || "Istruttore";
  const matchByName = await prisma.autoscuolaInstructor.findFirst({
    where: {
      companyId,
      userId: null,
      name: { equals: normalizedName, mode: "insensitive" },
    },
  });

  if (matchByName) {
    return prisma.autoscuolaInstructor.update({
      where: { id: matchByName.id },
      data: { userId },
    });
  }

  return prisma.autoscuolaInstructor.create({
    data: {
      companyId,
      userId,
      name: normalizedName,
    },
  });
}
