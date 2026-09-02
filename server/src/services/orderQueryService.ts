import { prisma } from '../db';
import { OrderStatus } from '../generated/prisma/client';
import { calculateTotalCents } from '../lib/orderTotals';
import type { ActingUser } from './orderPolicy';

export type OrderSortField = 'placedAt' | 'status' | 'tableNumber';
export type SortDirection = 'asc' | 'desc';

export type ListOrdersParams = {
    /** Goal 6: text search on table number. Exact match, because the column is an integer. */
    tableNumber?: number;
    status?: OrderStatus[];
    waiterId?: string;
    /** Inclusive lower / exclusive upper bound on placedAt. */
    placedFrom?: Date;
    placedTo?: Date;
    /** Only orders I am primary waiter or a collaborator on. */
    mineOnly?: boolean;
    includeArchived?: boolean;
    sortBy?: OrderSortField;
    sortDirection?: SortDirection;
    page?: number;
    pageSize?: number;
};

const LIST_INCLUDE = {
    primaryWaiter: { select: { id: true, name: true } },
    collaborators: { select: { userId: true } },
    lines: { select: { unitPriceCents: true, quantity: true, voidedAt: true } },
    _count: { select: { lines: true } },
} as const;

/**
 * Goal 6: search, filter, sort and paginate — all in the database.
 *
 * The browser never receives more orders than it displays, and it never
 * filters a list itself. The response carries the total match count so the
 * client can render "page 2 of 9" without fetching everything.
 */
export async function listOrders(actor: ActingUser, params: ListOrdersParams = {}) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const sortBy = params.sortBy ?? 'placedAt';
    const sortDirection = params.sortDirection ?? 'desc';

    const where = {
        ...(params.includeArchived ? {} : { archivedAt: null }),
        ...(params.tableNumber !== undefined ? { tableNumber: params.tableNumber } : {}),
        ...(params.status && params.status.length > 0 ? { status: { in: params.status } } : {}),
        ...(params.waiterId ? { primaryWaiterId: params.waiterId } : {}),
        ...(params.placedFrom || params.placedTo
            ? {
                placedAt: {
                    ...(params.placedFrom ? { gte: params.placedFrom } : {}),
                    ...(params.placedTo ? { lt: params.placedTo } : {}),
                },
            }
            : {}),
        ...(params.mineOnly
            ? {
                OR: [
                    { primaryWaiterId: actor.id },
                    { collaborators: { some: { userId: actor.id } } },
                ],
            }
            : {}),
    };

    // The page and the count run concurrently against the same filter.
    //
    // An earlier version wrapped these in prisma.$transaction([...]) so the count
    // could never describe a different set of rows than the page. Against Neon's
    // transaction pooler that turned out to be a bad trade: it needs a dedicated
    // transaction slot, and on a cold start it fails with P2028 before the
    // database has finished waking up. The consistency it bought is worth very
    // little here — a read-only list where the worst case is "48 results" next to
    // a page computed a few milliseconds earlier — and the cost was the endpoint
    // failing outright. Two independent reads is the right shape for this query.
    const [rows, total] = await Promise.all([
        prisma.order.findMany({
            where,
            include: LIST_INCLUDE,
            orderBy: { [sortBy]: sortDirection },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.order.count({ where }),
    ]);

    const orders = rows.map((order) => {
        const { lines, _count, ...rest } = order;
        return {
            ...rest,
            lineCount: _count.lines,
            totalCents: calculateTotalCents(lines),
        };
    });

    return {
        orders,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}