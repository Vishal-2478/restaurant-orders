import { prisma } from '../db';
import { env } from '../env';

/**
 * Goal 8 — the dashboard.
 *
 * These are the only queries in the project written as SQL by hand. Two
 * reasons: the fourteen-day chart has to include days on which nothing was
 * served, which means generating the date series in the database and left
 * joining onto it; and every "today" here has to be a day in the restaurant's
 * timezone, not in UTC.
 *
 * That second point is not cosmetic. Prisma stores timestamps as UTC. An order
 * served at 00:30 in Kolkata was served at 19:00 the PREVIOUS day in UTC, so a
 * naive `servedAt::date = current_date` silently drops the first five and a
 * half hours of every day from the figures. Converting through the restaurant
 * timezone first is what makes "served today" mean what a manager means by it.
 */

export type DashboardSummary = {
    openOrders: number;
    placedToday: number;
    servedToday: number;
    revenueTodayCents: number;
};

export type StatusBreakdownRow = { status: string; count: number };

export type WaiterBreakdownRow = {
    id: string;
    name: string;
    ordersToday: number;
    servedToday: number;
};

export type ServedPerDayRow = { day: string; served: number };

export async function getSummary(): Promise<DashboardSummary> {
    const tz = env.RESTAURANT_TIMEZONE;

    const rows = await prisma.$queryRaw<DashboardSummary[]>`
    WITH today AS (SELECT (now() AT TIME ZONE ${tz})::date AS d)
    SELECT
      (SELECT count(*)::int FROM orders
         WHERE "archivedAt" IS NULL
           AND status IN ('PLACED','ACCEPTED','PREPARING','READY'))          AS "openOrders",

      (SELECT count(*)::int FROM orders, today
         WHERE "archivedAt" IS NULL
           AND ("placedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = today.d)
                                                                             AS "placedToday",

      (SELECT count(*)::int FROM orders, today
         WHERE "servedAt" IS NOT NULL
           AND ("servedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = today.d)
                                                                             AS "servedToday",

      -- Revenue is the sum of NON-VOIDED lines on orders SERVED today.
      -- Voided lines were never charged; unserved orders were not paid for yet.
      (SELECT COALESCE(sum(l."unitPriceCents" * l.quantity), 0)::int
         FROM order_lines l
         JOIN orders o ON o.id = l."orderId", today
         WHERE l."voidedAt" IS NULL
           AND o."servedAt" IS NOT NULL
           AND (o."servedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = today.d)
                                                                             AS "revenueTodayCents"
  `;

    return rows[0]!;
}

export async function getStatusBreakdown(): Promise<StatusBreakdownRow[]> {
    return prisma.$queryRaw<StatusBreakdownRow[]>`
    SELECT status::text AS status, count(*)::int AS count
    FROM orders
    WHERE "archivedAt" IS NULL
    GROUP BY status
    ORDER BY status
  `;
}

export async function getWaiterBreakdown(): Promise<WaiterBreakdownRow[]> {
    const tz = env.RESTAURANT_TIMEZONE;

    // LEFT JOIN from users, so a waiter with no orders today still appears with
    // a zero rather than vanishing from the list.
    return prisma.$queryRaw<WaiterBreakdownRow[]>`
    SELECT
      u.id::text AS id,
      u.name     AS name,
      count(o.id)::int AS "ordersToday",
      COALESCE(sum(CASE WHEN o."servedAt" IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS "servedToday"
    FROM users u
    LEFT JOIN orders o
      ON o."primaryWaiterId" = u.id
     AND o."archivedAt" IS NULL
     AND (o."placedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date
         = (now() AT TIME ZONE ${tz})::date
    WHERE u.role = 'WAITER'
    GROUP BY u.id, u.name
    ORDER BY u.name
  `;
}

/**
 * Fourteen rows, always — including days with no orders at all.
 *
 * A plain GROUP BY would return only the days that had activity, and the chart
 * would silently close the gaps, making a quiet Tuesday disappear instead of
 * showing as a zero. generate_series builds the calendar first and the counts
 * are joined onto it.
 */
export async function getServedPerDay(days = 14): Promise<ServedPerDayRow[]> {
    const tz = env.RESTAURANT_TIMEZONE;
    const span = `${days - 1} days`;

    return prisma.$queryRaw<ServedPerDayRow[]>`
    WITH calendar AS (
      SELECT generate_series(
        (now() AT TIME ZONE ${tz})::date - ${span}::interval,
        (now() AT TIME ZONE ${tz})::date,
        interval '1 day'
      )::date AS day
    )
    SELECT
      to_char(c.day, 'YYYY-MM-DD') AS day,
      count(o.id)::int             AS served
    FROM calendar c
    LEFT JOIN orders o
      ON o."servedAt" IS NOT NULL
     AND (o."servedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = c.day
    GROUP BY c.day
    ORDER BY c.day
  `;
}

export async function getDashboard() {
    const [summary, byStatus, byWaiter, servedPerDay] = await Promise.all([
        getSummary(),
        getStatusBreakdown(),
        getWaiterBreakdown(),
        getServedPerDay(),
    ]);

    return { summary, byStatus, byWaiter, servedPerDay };
}