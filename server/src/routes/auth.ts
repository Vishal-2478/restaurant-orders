import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as authService from '../services/authService';
import { requireAuth, requireRole } from '../middleware/auth';
import { unauthorized } from '../lib/errors';
import { Role } from '../generated/prisma/client';

export const authRouter = Router();

// Sign-in is the one endpoint an attacker can hammer with guesses, so it is the
// one endpoint that is rate limited.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
        },
    },
});

const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
    refreshToken: z.string().min(1, 'A refresh token is required'),
});

const createUserSchema = z.object({
    email: z.email(),
    name: z.string().min(1).max(120),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['MANAGER', 'WAITER']),
});

authRouter.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await authService.login(email, password));
});

authRouter.post('/refresh', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json(await authService.refresh(refreshToken));
});

authRouter.post('/logout', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req, res) => {
    if (!req.user) throw unauthorized();
    res.json(await authService.getCurrentUser(req.user.id));
});

export const usersRouter = Router();

usersRouter.post('/', requireAuth, requireRole('MANAGER'), async (req, res) => {
    const input = createUserSchema.parse(req.body);
    res.status(201).json(await authService.createUser(input));
});

usersRouter.get('/', requireAuth, async (req, res) => {
    const role = req.query.role;
    const parsed = typeof role === 'string' ? (role.toUpperCase() as Role) : undefined;
    const valid = parsed === 'MANAGER' || parsed === 'WAITER' ? parsed : undefined;
    res.json(await authService.listUsers(valid));
});