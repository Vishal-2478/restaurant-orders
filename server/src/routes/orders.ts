import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { unauthorized } from '../lib/errors';
import { acknowledgeAlert, listSlowOrderAlerts } from '../services/alertService';
import { listOrders } from '../services/orderQueryService';
import { exportOrdersCsv } from '../services/exportService';
import {
    addCollaborator,
    addLine,
    addNote,
    archiveOrder,
    changeStatus,
    createOrder,
    getOrderDetail,
    listMyOrders,
    removeCollaborator,
    restoreOrder,
    voidLine,
} from '../services/orderService';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

/**
 * `req.user` is set by requireAuth, but its type is optional because Express's
 * Request is shared with routes that have no auth. This narrows it once so the
 * handlers below don't each need a non-null assertion.
 */
function actorFrom(req: { user?: { id: string; role: 'MANAGER' | 'WAITER' } }) {
    if (!req.user) {
        throw unauthorized('This endpoint requires an access token.');
    }
    return req.user;
}

const idParam = z.object({ id: z.uuid() });
const lineParams = z.object({ id: z.uuid(), lineId: z.uuid() });
const collaboratorParams = z.object({ id: z.uuid(), userId: z.uuid() });

const createOrderSchema = z.object({
    // Positive integer: table numbers start at 1, and the database has a CHECK
    // constraint saying the same thing.
    tableNumber: z.int().min(1),
});

const addLineSchema = z.object({
    menuItemId: z.uuid(),
    quantity: z.int().min(1).max(99),
    specialInstructions: z.string().trim().max(300).nullable().optional(),
});

const voidLineSchema = z.object({
    // Goal 4: the reason is required, and an empty string is not a reason.
    reason: z.string().trim().min(1).max(300),
});

const statusSchema = z.object({
    to: z.enum(['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
});

const collaboratorSchema = z.object({ userId: z.uuid() });
const noteSchema = z.object({ message: z.string().trim().min(1).max(500) });

const boolFromQuery = z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional();

const statusEnum = z.enum([
    'PLACED',
    'ACCEPTED',
    'PREPARING',
    'READY',
    'SERVED',
    'CANCELLED',
]);

const exportQuerySchema = z.object({ day: z.coerce.date().optional() });

const listQuerySchema = z.object({
    // Exact match: tableNumber is an integer so that sorting by table is
    // numerically correct. The cost, accepted and documented, is that this is
    // not a substring search.
    tableNumber: z.coerce.number().int().min(1).optional(),
    // Repeatable: ?status=PLACED&status=ACCEPTED
    status: z.union([statusEnum, z.array(statusEnum)]).optional(),
    waiterId: z.uuid().optional(),
    placedFrom: z.coerce.date().optional(),
    placedTo: z.coerce.date().optional(),
    mineOnly: boolFromQuery,
    includeArchived: boolFromQuery,
    sortBy: z.enum(['placedAt', 'status', 'tableNumber']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------- reading ----

/**
 * Goal 6: search, filter, sort and paginate. Everything happens in the
 * database; the response carries the total match count alongside one page.
 */
ordersRouter.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const status = query.status
        ? Array.isArray(query.status)
            ? query.status
            : [query.status]
        : undefined;

    res.json(await listOrders(actorFrom(req), { ...query, status }));
});

/** Goal 10: the alerts list, and the number for the nav badge. */
ordersRouter.get('/alerts', async (_req, res) => {
    const alerts = await listSlowOrderAlerts();
    res.json({ alerts, count: alerts.length });
});

/** Goal 7: CSV export of a day's orders. Defaults to today. */
ordersRouter.get('/export.csv', async (req, res) => {
    const day = exportQuerySchema.parse(req.query).day ?? new Date();
    const csv = await exportOrdersCsv(day);
    const stamp = day.toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${stamp}.csv"`);
    res.send(csv);
});

/** Goal 5: every order where I am primary waiter or a collaborator. */
ordersRouter.get('/mine', async (req, res) => {
    res.json({ orders: await listMyOrders(actorFrom(req)) });
});

ordersRouter.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await getOrderDetail(actorFrom(req), id));
});

// --------------------------------------------------------------- writing ----

ordersRouter.post('/', async (req, res) => {
    const body = createOrderSchema.parse(req.body);
    const order = await createOrder(actorFrom(req), body);
    res.status(201).json(order);
});

ordersRouter.post('/:id/lines', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = addLineSchema.parse(req.body);
    res.status(201).json(await addLine(actorFrom(req), id, body));
});

ordersRouter.post('/:id/lines/:lineId/void', async (req, res) => {
    const { id, lineId } = lineParams.parse(req.params);
    const body = voidLineSchema.parse(req.body);
    res.json(await voidLine(actorFrom(req), id, lineId, body));
});

ordersRouter.post('/:id/status', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { to } = statusSchema.parse(req.body);
    res.json(await changeStatus(actorFrom(req), id, to));
});

ordersRouter.post('/:id/collaborators', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { userId } = collaboratorSchema.parse(req.body);
    res.status(201).json(await addCollaborator(actorFrom(req), id, userId));
});

ordersRouter.delete('/:id/collaborators/:userId', async (req, res) => {
    const { id, userId } = collaboratorParams.parse(req.params);
    res.json(await removeCollaborator(actorFrom(req), id, userId));
});

ordersRouter.post('/:id/archive', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await archiveOrder(actorFrom(req), id));
});

ordersRouter.post('/:id/restore', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await restoreOrder(actorFrom(req), id));
});

ordersRouter.post('/:id/alerts/ack', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.status(201).json(await acknowledgeAlert(actorFrom(req), id));
});

ordersRouter.post('/:id/notes', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { message } = noteSchema.parse(req.body);
    res.status(201).json(await addNote(actorFrom(req), id, message));
});