import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// Sets up WebSocket connections, which enables Neon to use WebSocket communication.
neonConfig.webSocketConstructor = ws;

const createPrisma = () => {
  const connectionString = `${process.env.DATABASE_URL}`;
  const adapter = new PrismaNeon({ connectionString });

  return new PrismaClient({ adapter });
};

declare global {
  // eslint-disable-next-line no-var
  var __regloPrisma:
    | ReturnType<typeof createPrisma>
    | undefined;
}

export const prisma = global.__regloPrisma ?? createPrisma();

// Cache the client on global in all environments so HMR in development and
// module re-evaluation in any environment don't create extra client instances.
global.__regloPrisma = prisma;
