import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/tokens';
import { forbidden, unauthorized } from '../lib/errors';
import { Role } from '../generated/prisma/client';

export const requireAuth: RequestHandler = (req, _res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
        throw unauthorized('This endpoint requires an access token.');
    }

    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.user = { id: payload.sub, role: payload.role };
    next();
};

export function requireRole(...allowed: Role[]): RequestHandler {
    return (req, _res, next) => {
        if (!req.user) {
            throw unauthorized('This endpoint requires an access token.');
        }
        if (!allowed.includes(req.user.role)) {
            throw forbidden(`This action is only available to a ${allowed.join(' or ')}.`);
        }
        next();
    };
}