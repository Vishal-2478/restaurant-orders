import type { Role } from '../generated/prisma/client';
import { forbidden } from '../lib/errors';

/**
 * The minimum we need to know about the person making the request.
 * Matches the shape `requireAuth` puts on `req.user`.
 */
export type ActingUser = {
    id: string;
    role: Role;
};

/**
 * The minimum we need to know about the order.
 *
 * Deliberately not Prisma's `Order` type. This function does not care about
 * the table number, the status or the timestamps, and typing it that way
 * would mean every test had to build a fully populated fake order.
 */
export type OrderAccessInfo = {
    primaryWaiterId: string;
    collaborators: { userId: string }[];
};

/**
 * Goal 1, fine-grained half: may THIS user act on THIS order?
 *
 * A manager may act on any order.
 * A waiter may act on an order only if they are its primary waiter,
 * or they were added to it as a collaborator.
 */
export function canActOnOrder(user: ActingUser, order: OrderAccessInfo): boolean {
    if (user.role === 'MANAGER') {
        return true;
    }

    if (order.primaryWaiterId === user.id) {
        return true;
    }

    return order.collaborators.some((collaborator) => collaborator.userId === user.id);
}

/**
 * Same rule, but throws the 403 instead of returning false.
 * Routes call this so the check cannot be written and then ignored.
 */
export function assertCanActOnOrder(user: ActingUser, order: OrderAccessInfo): void {
    if (!canActOnOrder(user, order)) {
        throw forbidden('You do not have access to this order.');
    }
}