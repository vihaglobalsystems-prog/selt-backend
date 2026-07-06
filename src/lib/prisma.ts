import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Serverless-safe Prisma client.
// connection_limit=1  — one connection per serverless function instance (prevents pool exhaustion on Neon free tier)
// pool_timeout=20     — wait up to 20 s for a connection before throwing (covers Neon cold start)
// connect_timeout=15  — TCP connect timeout
// These are appended as query params; they are ignored if already present in DATABASE_URL.
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL || '';
  if (!base) return base;
  try {
    const url = new URL(base);
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    if (!url.searchParams.has('pool_timeout'))    url.searchParams.set('pool_timeout', '20');
    if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '15');
    return url.toString();
  } catch {
    return base;
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
