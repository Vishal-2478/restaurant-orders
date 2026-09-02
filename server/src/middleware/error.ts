import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { env } from '../env';

export const notFoundHandler: RequestHandler = (req, res) => {
    res.status(404).json({
        error: { code: 'NOT_FOUND', message: `No route matches ${req.method} ${req.path}` },
    });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
    }

    if (err instanceof ZodError) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_FAILED',
                message: 'Some of the values you sent are not valid.',
                fields: err.flatten().fieldErrors,
            },
        });
        return;
    }

    if (env.NODE_ENV !== 'test') {
        console.error('Unhandled error:', err);
    }

    res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our end.' },
    });
};