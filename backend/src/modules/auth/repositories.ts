import { and, eq, gt, isNull } from 'drizzle-orm';
import { sessions, users } from '../../db/schema/index.js';
import type { Database } from '../../db/types.js';
import { withTransaction } from '../../shared/transaction.js';

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};
export function createAuthRepository(db: Database) {
  return {
    async findByEmail(email: string) {
      return (
        await db.select().from(users).where(eq(users.email, email)).limit(1)
      )[0];
    },
    async register(
      input: { name: string; email: string; passwordHash: string },
      session: { tokenHash: string; expiresAt: Date; createdAt: Date },
    ) {
      return withTransaction(db, async (tx) => {
        const [user] = await tx
          .insert(users)
          .values(input)
          .returning(publicColumns);
        if (!user) throw new Error('User insert failed');
        await tx.insert(sessions).values({ ...session, userId: user.id });
        return user;
      });
    },
    async addSession(
      userId: string,
      session: { tokenHash: string; expiresAt: Date; createdAt: Date },
    ) {
      await db.insert(sessions).values({ ...session, userId });
    },
    async authenticate(tokenHash: string, now: Date) {
      return (
        await db
          .select({ user: publicColumns, sessionId: sessions.id })
          .from(sessions)
          .innerJoin(users, eq(users.id, sessions.userId))
          .where(
            and(
              eq(sessions.tokenHash, tokenHash),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, now),
            ),
          )
          .limit(1)
      )[0];
    },
    async revoke(userId: string, sessionId: string, now: Date) {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(sessions.id, sessionId),
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
          ),
        );
    },
  };
}
export type AuthRepository = ReturnType<typeof createAuthRepository>;
