import { OrderStatus } from '../generated/prisma/client';

/**
 * The order lifecycle, as a table rather than a chain of if-statements.
 *
 * Placed -> Accepted -> Preparing -> Ready -> Served
 * Cancelling is only possible from Placed or Accepted; once the kitchen has
 * started cooking, the food exists and the order has to be seen through.
 *
 * Served and Cancelled are terminal: nothing follows them.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PLACED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY'],
    READY: ['SERVED'],
    SERVED: [],
    CANCELLED: [],
};

/** How each status is written in a sentence shown to a person. */
const LABELS: Record<OrderStatus, string> = {
    PLACED: 'Placed',
    ACCEPTED: 'Accepted',
    PREPARING: 'Preparing',
    READY: 'Ready',
    SERVED: 'Served',
    CANCELLED: 'Cancelled',
};

/** Statuses in which an order is still open — not yet served or cancelled. */
export const OPEN_STATUSES: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'];

export function isTerminal(status: OrderStatus): boolean {
    return ALLOWED_TRANSITIONS[status].length === 0;
}

/** Lines can only be added or voided while the order is still in progress. */
export function isEditable(status: OrderStatus): boolean {
    return status !== 'SERVED' && status !== 'CANCELLED';
}

export type TransitionCheck =
    | { ok: true }
    | { ok: false; reason: string };

/**
 * Goal 4: an illegal move must be rejected "with a message explaining why".
 *
 * Returns a result rather than throwing, so this stays a pure function the
 * unit tests can call directly. The route turns `ok: false` into a 409 and
 * puts `reason` in the response body.
 */
export function checkTransition(from: OrderStatus, to: OrderStatus): TransitionCheck {
    if (from === to) {
        return { ok: false, reason: `This order is already ${LABELS[to]}.` };
    }

    const allowed = ALLOWED_TRANSITIONS[from];

    if (allowed.includes(to)) {
        return { ok: true };
    }

    if (isTerminal(from)) {
        return {
            ok: false,
            reason: `This order is ${LABELS[from]}, which is final. Its status cannot be changed again.`,
        };
    }

    if (to === 'CANCELLED') {
        return {
            ok: false,
            reason:
                `An order can only be cancelled while it is Placed or Accepted. ` +
                `This one is already ${LABELS[from]}, so the kitchen has started work on it.`,
        };
    }

    const next = allowed.map((status) => LABELS[status]).join(' or ');

    return {
        ok: false,
        reason: `An order cannot go from ${LABELS[from]} to ${LABELS[to]}. From ${LABELS[from]} the only valid next step is ${next}.`,
    };
}