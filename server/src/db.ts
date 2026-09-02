import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { env } from './env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
    adapter,
    // Neon's free tier suspends an idle database and takes a few seconds to wake.
    // Prisma's default 2s wait for a transaction slot is shorter than that, which
    // surfaces as P2028 "Unable to start a transaction in the given time" on the
    // first request after an idle period. These limits are generous enough to
    // survive a cold start without masking a genuinely stuck transaction.
    transactionOptions: {
        maxWait: 15_000,
        timeout: 30_000,
    },

});