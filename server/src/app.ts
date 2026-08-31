import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';

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

    return app;
}