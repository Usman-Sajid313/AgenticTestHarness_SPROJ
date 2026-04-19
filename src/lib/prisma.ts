/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: new (options?: { log?: string[] }) => any;
};

const globalForPrisma = global as unknown as { prisma?: any };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['error', 'warn'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
