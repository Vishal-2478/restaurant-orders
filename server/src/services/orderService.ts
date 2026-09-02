import { prisma } from '../db';
import { OrderStatus } from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../lib/errors';
import { checkTransition, isEditable } from '../lib/orderStatus';
import { calculateTotalCents, type LineForTotal } from '../lib/orderTotals';
import { assertCanActOnOrder, type ActingUser } from './orderPolicy';

/**
 * Everything a client needs about one order: the order itself, who is on it,
 * its lines, and its full timeline.
 */
const ORDER_DETAIL_INCLUDE = {
    primaryWaiter: { select: { id: true, name: true, email: true, role: true } },
    collaborators: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
    },
    lines: { orderBy: { createdAt: 'asc' } },
    events: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, name: true } } },
    },
} as const;

/** Attach the computed total so callers never have to add it up themselves. */
function withTotal<T extends { lines: LineForTotal[] }>(order: T) {
    return { ...order, totalCents: calculateTotalCents(order.lines) };
}

/** The columns every mutation needs before it is allowed to proceed. */
const ACCESS_INCLUDE = { collaborators: { select: { userId: true } } } as const;

type OrderForAccess = {
    id: string;
    status: OrderStatus;
    archivedAt: Date | null;
    primaryWaiterId: string;
    tableNumber: number;
    collaborators: { userId: string }[];
};

/**
 * Turn "the row I just loaded" into "the order I am allowed to change",
 * or throw. Every mutation starts with this, inside its own transaction,
 * so the permission check sees the same snapshot as the write.
 */
function requireOrderAccess(
    order: OrderForAccess | null,
    actor: ActingUser,
): OrderForAccess {
    if (!order) {
        throw notFound('Order not found.');
    }

    assertCanActOnOrder(actor, order);

    return order;
}

// --------------------------------------------------------------- reading ----

export async function getOrderDetail(actor: ActingUser, orderId: string) {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: ORDER_DETAIL_INCLUDE,
    });

    if (!order) {
        throw notFound('Order not found.');
    }

    // Decision 11: waiters may VIEW any order, but only ACT on their own.
    // Reading is deliberately not gated here.
    return withTotal(order);
}

/** Goal 5: one list of every order where I am primary waiter or collaborator. */
export async function listMyOrders(actor: ActingUser) {
    const orders = await prisma.order.findMany({
        where: {
            archivedAt: null,
            OR: [
                { primaryWaiterId: actor.id },
                { collaborators: { some: { userId: actor.id } } },
            ],
        },
        include: ORDER_DETAIL_INCLUDE,
        orderBy: { placedAt: 'desc' },
    });

    return orders.map(withTotal);
}

// -------------------------------------------------------------- creating ----

export async function createOrder(actor: ActingUser, input: { tableNumber: number }) {
    // Goal 2: the creator becomes the primary waiter. It is not a field the
    // client gets to send, or a waiter could file an order under someone else.
    return prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
            data: {
                tableNumber: input.tableNumber,
                primaryWaiterId: actor.id,
            },
        });

        await tx.orderEvent.create({
            data: {
                orderId: order.id,
                type: 'ORDER_CREATED',
                actorId: actor.id,
                toStatus: order.status,
                message: `Order opened for table ${order.tableNumber}.`,
            },
        });

        return order;
    });
}

// ----------------------------------------------------------------- lines ----

export async function addLine(
    actor: ActingUser,
    orderId: string,
    input: { menuItemId: string; quantity: number; specialInstructions?: string | null },
) {
    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        if (order.archivedAt) {
            throw conflict('This order is archived. Restore it before changing it.');
        }

        if (!isEditable(order.status)) {
            throw conflict(
                `Lines cannot be added to an order that is already ${order.status.toLowerCase()}.`,
            );
        }

        const menuItem = await tx.menuItem.findUnique({ where: { id: input.menuItemId } });

        if (!menuItem) {
            throw notFound('Menu item not found.');
        }

        if (menuItem.archivedAt) {
            throw conflict(`"${menuItem.name}" is no longer on the menu.`);
        }

        if (!menuItem.isAvailable) {
            throw conflict(`"${menuItem.name}" is currently unavailable.`);
        }

        // Goal 3, the important bit: the name and price are COPIED onto the line
        // now. Nothing later reads them back off the menu item, so tomorrow's
        // price change cannot alter what this table was charged today.
        const line = await tx.orderLine.create({
            data: {
                orderId,
                menuItemId: menuItem.id,
                menuItemName: menuItem.name,
                unitPriceCents: menuItem.priceCents,
                quantity: input.quantity,
                specialInstructions: input.specialInstructions ?? null,
                createdById: actor.id,
            },
        });

        await tx.orderEvent.create({
            data: {
                orderId,
                type: 'LINE_ADDED',
                actorId: actor.id,
                orderLineId: line.id,
                message: `Added ${line.quantity} x ${line.menuItemName}.`,
                metadata: {
                    quantity: line.quantity,
                    unitPriceCents: line.unitPriceCents,
                    menuItemId: line.menuItemId,
                },
            },
        });

        return line;
    });
}

export async function voidLine(
    actor: ActingUser,
    orderId: string,
    lineId: string,
    input: { reason: string },
) {
    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        if (!isEditable(order.status)) {
            throw conflict(
                `Lines cannot be voided on an order that is already ${order.status.toLowerCase()}.`,
            );
        }

        const line = await tx.orderLine.findUnique({ where: { id: lineId } });

        if (!line || line.orderId !== orderId) {
            throw notFound('Order line not found on this order.');
        }

        if (line.voidedAt) {
            throw conflict('This line has already been voided.');
        }

        // Goal 4: voiding marks, never deletes — and the reason is required.
        // The three void columns are written together; a database CHECK constraint
        // rejects any row where some are set and others are not.
        const voided = await tx.orderLine.update({
            where: { id: lineId },
            data: {
                voidedAt: new Date(),
                voidReason: input.reason,
                voidedById: actor.id,
            },
        });

        await tx.orderEvent.create({
            data: {
                orderId,
                type: 'LINE_VOIDED',
                actorId: actor.id,
                orderLineId: lineId,
                message: `Voided ${voided.quantity} x ${voided.menuItemName}: ${input.reason}`,
                metadata: { reason: input.reason },
            },
        });

        return voided;
    });
}

// ---------------------------------------------------------------- status ----

export async function changeStatus(actor: ActingUser, orderId: string, to: OrderStatus) {
    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        if (order.archivedAt) {
            throw conflict('This order is archived. Restore it before changing its status.');
        }

        const check = checkTransition(order.status, to);

        if (!check.ok) {
            // Goal 4: rejected by the server, with a message explaining why.
            throw conflict(check.reason);
        }

        const updated = await tx.order.update({
            where: { id: orderId },
            data: {
                status: to,
                // Denormalised timestamps, so the dashboard does not have to scan the
                // event log to answer "how many were served today".
                ...(to === 'READY' ? { readyAt: new Date() } : {}),
                ...(to === 'SERVED' ? { servedAt: new Date() } : {}),
            },
        });

        // Written in the SAME transaction as the status change. If either fails,
        // both roll back, so the order and its history can never disagree.
        await tx.orderEvent.create({
            data: {
                orderId,
                type: 'STATUS_CHANGED',
                actorId: actor.id,
                fromStatus: order.status,
                toStatus: to,
            },
        });

        return updated;
    });
}

// --------------------------------------------------------- collaborators ----

export async function addCollaborator(actor: ActingUser, orderId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        if (userId === order.primaryWaiterId) {
            throw conflict('That waiter is already the primary waiter on this order.');
        }

        const user = await tx.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw notFound('User not found.');
        }

        if (!user.isActive) {
            throw conflict('That user is no longer active.');
        }

        const existing = await tx.orderCollaborator.findUnique({
            where: { orderId_userId: { orderId, userId } },
        });

        if (existing) {
            throw conflict('That waiter is already a collaborator on this order.');
        }

        const collaborator = await tx.orderCollaborator.create({
            data: { orderId, userId, addedById: actor.id },
        });

        await tx.orderEvent.create({
            data: {
                orderId,
                type: 'COLLABORATOR_ADDED',
                actorId: actor.id,
                message: `${user.name} was added as a collaborator.`,
                metadata: { userId },
            },
        });

        return collaborator;
    });
}

export async function removeCollaborator(actor: ActingUser, orderId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        const existing = await tx.orderCollaborator.findUnique({
            where: { orderId_userId: { orderId, userId } },
            include: { user: { select: { name: true } } },
        });

        if (!existing) {
            throw notFound('That waiter is not a collaborator on this order.');
        }

        await tx.orderCollaborator.delete({
            where: { orderId_userId: { orderId, userId } },
        });

        await tx.orderEvent.create({
            data: {
                orderId,
                type: 'COLLABORATOR_REMOVED',
                actorId: actor.id,
                message: `${existing.user.name} was removed as a collaborator.`,
                metadata: { userId },
            },
        });

        return { orderId, userId, removed: true };
    });
}

// ------------------------------------------------- archive, restore, note ----

export async function archiveOrder(actor: ActingUser, orderId: string) {
    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        if (order.archivedAt) {
            throw conflict('This order is already archived.');
        }

        const updated = await tx.order.update({
            where: { id: orderId },
            data: { archivedAt: new Date() },
        });

        await tx.orderEvent.create({
            data: { orderId, type: 'ORDER_ARCHIVED', actorId: actor.id },
        });

        return updated;
    });
}

export async function restoreOrder(actor: ActingUser, orderId: string) {
    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        if (!order.archivedAt) {
            throw conflict('This order is not archived.');
        }

        const updated = await tx.order.update({
            where: { id: orderId },
            data: { archivedAt: null },
        });

        await tx.orderEvent.create({
            data: { orderId, type: 'ORDER_RESTORED', actorId: actor.id },
        });

        return updated;
    });
}

/** Goal 9: notes are part of the timeline, like everything else. */
export async function addNote(actor: ActingUser, orderId: string, message: string) {
    const trimmed = message.trim();

    if (trimmed.length === 0) {
        throw badRequest('A note cannot be empty.');
    }

    return prisma.$transaction(async (tx) => {
        const order = requireOrderAccess(
            await tx.order.findUnique({ where: { id: orderId }, include: ACCESS_INCLUDE }),
            actor,
        );

        return tx.orderEvent.create({
            data: {
                orderId,
                type: 'NOTE_ADDED',
                actorId: actor.id,
                message: trimmed,
            },
        });
    });
}