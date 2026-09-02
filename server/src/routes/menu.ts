import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    archiveMenuItem,
    createMenuItem,
    getMenuItem,
    listMenuItems,
    restoreMenuItem,
    updateMenuItem,
} from '../services/menuService';

export const menuRouter = Router();

// Every route below needs a logged-in user; the writes additionally need a
// manager. Reading the menu is something any member of staff does constantly.
menuRouter.use(requireAuth);

// Query strings are always text. `z.coerce.boolean()` is wrong here because
// Boolean("false") is true — so "?availableOnly=false" would mean the opposite
// of what it says. Match the two literal words instead.
const boolFromQuery = z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional();

const listQuerySchema = z.object({
    includeArchived: boolFromQuery,
    availableOnly: boolFromQuery,
    search: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
});

const createSchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    // Money is an integer number of cents. A non-integer price is a bug in the
    // caller, not a value to round.
    priceCents: z.int().min(0),
    isAvailable: z.boolean().optional(),
});

// Every field optional, but at least one must be present — otherwise the
// request is a no-op and almost certainly a mistake.
const updateSchema = createSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    { message: 'Provide at least one field to update.' },
);

const idParamSchema = z.object({ id: z.uuid() });

menuRouter.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const items = await listMenuItems(query);
    res.json({ items });
});

menuRouter.get('/:id', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(await getMenuItem(id));
});

menuRouter.post('/', requireRole('MANAGER'), async (req, res) => {
    const body = createSchema.parse(req.body);
    const item = await createMenuItem(body);
    res.status(201).json(item);
});

menuRouter.patch('/:id', requireRole('MANAGER'), async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateSchema.parse(req.body);
    res.json(await updateMenuItem(id, body));
});

menuRouter.post('/:id/archive', requireRole('MANAGER'), async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(await archiveMenuItem(id));
});

menuRouter.post('/:id/restore', requireRole('MANAGER'), async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(await restoreMenuItem(id));
});