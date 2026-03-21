let prismaClient: unknown = null;

export const getPrisma = async (): Promise<any> => {
  if (!prismaClient) {
    const [{ PrismaClient }, { PrismaNeon }, neonModule, wsModule] = await Promise.all([
      import("@prisma/client"),
      import("@prisma/adapter-neon"),
      import("@neondatabase/serverless"),
      import("ws"),
    ]);
    const neonConfig = neonModule.neonConfig;
    const ws = (wsModule as { default?: unknown }).default ?? wsModule;
    neonConfig.webSocketConstructor = ws as typeof globalThis.WebSocket;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL for Trigger Prisma client");
    }
    const adapter = new PrismaNeon({ connectionString });
    prismaClient = new PrismaClient({ adapter });
  }
  return prismaClient as any;
};
