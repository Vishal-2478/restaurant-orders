import { prisma } from '../db';
import { OrderStatus } from '../generated/prisma/client';
import { env } from '../env';
import { notFound } from '../lib/errors';
import { isAlerting, minutesBetween } from '../lib/alertRules';
import type { ActingUser } from './orderPolicy';

/**
 * Goal 10 — slow-order alerts.
 *
 * There is no "is alerting" column anywhere, and no background job. Whether an
 * order is alerting is DERIVED, every time it is asked for, from three facts:
 *
 *   1. it is still open and has not reached Ready
 *   2. it was placed more than SLOW_ORDER_MINUTES ago
 *   3. its most recent acknowledgement, if any, is older than
 *      ALERT_SNOOZE_MINUTES
 *
 * A boolean flag could not satisfy this. The requirement is that an
 * acknowledged alert comes back M minutes later, and a boolean records THAT it
 * was acknowledged but not WHEN, so there is nothing to count from. Storing
 * acknowledgements as timestamped rows makes the re-arm fall out of the
 * arithmetic, and lets the same order be acknowledged any number of times.
 */

/** Statuses that count as "not yet Ready". READY is excluded by the brief. */
const NOT_YET_READY = ['PLACED', 'ACCEPTED', 'PREPARING'] as const;

function minutesAgo(minutes: number, now: Date): Date {
    return new Date(now.getTime() - minutes * 60_000);
}

export type SlowOrderAlert = {
    orderId: string;
    tableNumber: number;
    // Must be OrderStatus, not string. The filter below narrows with a type
    // predicate, and a predicate's type has to be assignable to the type it is
    // narrowing — string is wider than the enum, so it would be rejected.
    status: OrderStatus;
    placedAt: Date;
    minutesOpen: number;
    primaryWaiter: { id: string; name: string };
    lastAcknowledgedAt: Date | null;
    /** True when this alert has fired again after being acknowledged. */
    reArmed: boolean;
};

export async function listSlowOrderAlerts(now: Date = new Date()): Promise<SlowOrderAlert[]> {
    const slowerThan = minutesAgo(env.SLOW_ORDER_MINUTES, now);

    // The candidate set is bounded by how many orders are open right now, not by
    // how many orders have ever existed. That is why this query does not get
    // slower as the history grows.
    const candidates = await prisma.order.findMany({
        where: {
            archivedAt: null,
            status: { in: [...NOT_YET_READY] },
            placedAt: { lt: slowerThan },
        },
        include: {
            primaryWaiter: { select: { id: true, name: true } },
            alertAcks: {
                orderBy: { acknowledgedAt: 'desc' },
                take: 1,
                select: { acknowledgedAt: true },
            },
        },
        orderBy: { placedAt: 'asc' },
    });

    // Built with a loop rather than map().filter(). A filter with a type
    // predicate has to match the inferred shape exactly, which makes it brittle;
    // pushing into a typed array checks each object against SlowOrderAlert
    // directly, which is both stricter and easier to read.
    const alerts: SlowOrderAlert[] = [];

    for (const order of candidates) {
        const lastAcknowledgedAt: Date | null = order.alertAcks[0]?.acknowledgedAt ?? null;

        const alerting = isAlerting({
            placedAt: order.placedAt,
            lastAcknowledgedAt,
            now,
            slowOrderMinutes: env.SLOW_ORDER_MINUTES,
            alertSnoozeMinutes: env.ALERT_SNOOZE_MINUTES,
        });

        if (!alerting) {
            continue;
        }

        alerts.push({
            orderId: order.id,
            tableNumber: order.tableNumber,
            status: order.status,
            placedAt: order.placedAt,
            minutesOpen: minutesBetween(order.placedAt, now),
            primaryWaiter: order.primaryWaiter,
            lastAcknowledgedAt,
            // If it was acknowledged before and is alerting again, the snooze
            // expired — this is the re-arm the brief asks for.
            reArmed: lastAcknowledgedAt !== null,
        });
    }

    return alerts;
}

/** The number for the nav badge. */
export async function countSlowOrderAlerts(now: Date = new Date()): Promise<number> {
    return (await listSlowOrderAlerts(now)).length;
}

/**
 * Acknowledging appends a row. It never updates an order, and it never clears
 * anything — which is exactly why the alert can come back on its own.
 */
export async function acknowledgeAlert(actor: ActingUser, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
        throw notFound('Order not found.');
    }

    return prisma.orderAlertAck.create({
        data: { orderId, acknowledgedById: actor.id },
    });
}