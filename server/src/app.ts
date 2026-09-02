import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';
import { authRouter, usersRouter } from './routes/auth';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
    const app = express();

    app.use(helmet());
    app.use(
        cors({
            origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
            credentials: false,
        })
    );
    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.json({ ok: true, service: 'restaurant-orders-api' });
    });

    app.use('/api/auth', authRouter);
    app.use('/api/users', usersRouter);

    // Order matters: the 404 handler catches anything no route claimed, and the
    // error handler must be registered last so every thrown error reaches it.
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}