import type { OrderStatus } from './types';

/**
 * A copy of the server's transition table, used ONLY to decide which buttons
 * to render. The server has the authoritative version and re-checks every
 * request — this is a convenience so the user is not offered a move that will
 * be rejected, not a rule.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PLACED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY'],
    READY: ['SERVED'],
    SERVED: [],
    CANCELLED: [],
};

export const TRANSITION_LABELS: Record<OrderStatus, string> = {
    PLACED: 'Reopen',
    ACCEPTED: 'Accept',
    PREPARING: 'Start preparing',
    READY: 'Mark ready',
    SERVED: 'Mark served',
    CANCELLED: 'Cancel order',
};

/** Lines can only be added or voided before the order is finished. */
export function isEditable(status: OrderStatus): boolean {
    return status !== 'SERVED' && status !== 'CANCELLED';
}