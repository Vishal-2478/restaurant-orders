import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { Role } from '../generated/prisma/client';
import { unauthorized } from './errors';

export type AccessTokenPayload = {
    sub: string;
    role: Role;
};

export function signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    try {
        const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
        if (typeof decoded === 'string' || !decoded.sub) {
            throw unauthorized('That access token is not valid.');
        }
        return { sub: decoded.sub, role: (decoded as jwt.JwtPayload).role as Role };
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            throw unauthorized('Your session has expired. Please sign in again.');
        }
        throw unauthorized('That access token is not valid.');
    }
}

export function generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}