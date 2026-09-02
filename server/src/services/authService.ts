import crypto from 'node:crypto';
import { prisma } from '../db';
import { env } from '../env';
import { durationToMs } from '../lib/duration';
import { conflict, unauthorized } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../lib/tokens';
import { Role } from '../generated/prisma/client';

export type PublicUser = {
    id: string;
    email: string;
    name: string;
    role: Role;
};

export type AuthResult = {
    accessToken: string;
    refreshToken: string;
    user: PublicUser;
};

type UserRow = {
    id: string;
    email: string;
    name: string;
    role: Role;
    passwordHash: string;
    isActive: boolean;
};

function toPublicUser(user: UserRow): PublicUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// A valid Argon2 hash of a random string, used only to keep the cost of a failed
// login the same whether or not the email exists. Without it, a missing email
// returns noticeably faster than a wrong password, which tells an attacker which
// addresses are registered.
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
    decoyHash ??= hashPassword(crypto.randomUUID());
    return decoyHash;
}

async function issueTokens(user: UserRow): Promise<AuthResult> {
    const refreshToken = generateRefreshToken();

    await prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: hashRefreshToken(refreshToken),
            expiresAt: new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_TTL)),
        },
    });

    return {
        accessToken: signAccessToken({ sub: user.id, role: user.role }),
        refreshToken,
        user: toPublicUser(user),
    };
}

export async function login(email: string, password: string): Promise<AuthResult> {
    const user: UserRow | null = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.isActive) {
        await verifyPassword(await getDecoyHash(), password);
        throw unauthorized('That email and password combination is not recognised.');
    }

    const passwordMatches = await verifyPassword(user.passwordHash, password);
    if (!passwordMatches) {
        throw unauthorized('That email and password combination is not recognised.');
    }

    return issueTokens(user);
}

// Refresh tokens are rotated: the one presented is revoked and a new one issued.
// A stolen token is then usable at most once, and its use burns the copy the real
// user is holding, which surfaces the theft rather than hiding it.
export async function refresh(token: string): Promise<AuthResult> {
    const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(token) },
        include: { user: true },
    });

    const stillValid =
        stored && !stored.revokedAt && stored.expiresAt > new Date() && stored.user.isActive;

    if (!stillValid) {
        throw unauthorized('Your session is no longer valid. Please sign in again.');
    }

    await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
    });

    return issueTokens(stored.user);
}

export async function logout(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
    });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
    const user: UserRow | null = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
        throw unauthorized('This account is no longer active.');
    }

    return toPublicUser(user);
}

export async function createUser(input: {
    email: string;
    name: string;
    password: string;
    role: Role;
}): Promise<PublicUser> {
    const email = input.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        throw conflict('An account with that email address already exists.');
    }

    const user: UserRow = await prisma.user.create({
        data: {
            email,
            name: input.name.trim(),
            role: input.role,
            passwordHash: await hashPassword(input.password),
        },
    });

    return toPublicUser(user);
}

export async function listUsers(role?: Role): Promise<PublicUser[]> {
    const users: UserRow[] = await prisma.user.findMany({
        where: { isActive: true, ...(role ? { role } : {}) },
        orderBy: { name: 'asc' },
    });

    return users.map(toPublicUser);
}