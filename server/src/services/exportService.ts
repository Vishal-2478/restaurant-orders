import { prisma } from '../db';
import { env } from '../env';
import { toCsv, type CsvColumn } from '../lib/csv';
import { calculateTotalCents } from '../lib/orderTotals';

/**
 * Goal 7, second half — CSV export of the day's orders.
 *
 * One row per order. The figures are computed here on the server, the same way
 * the API computes them everywhere else, so the spreadsheet and the screen can
 * never disagree.
 */

type ExportRow = {
    orderId: string;
    tableNumber: number;
    status: string;
    primaryWaiter: string;
    placedAt: string;
    servedAt: string;
    lineCount: number;
    voidedLineCount: number;
    total: string;
};

const COLUMNS: CsvColumn<ExportRow>[] = [
    { key: 'orderId', header: 'Order ID' },
    { key: 'tableNumber', header: 'Table' },
    { key: 'status', header: 'Status' },
    { key: 'primaryWaiter', header: 'Primary waiter' },
    { key: 'placedAt', header: 'Placed at' },
    { key: 'servedAt', header: 'Served at' },
    { key: 'lineCount', header: 'Lines' },
    { key: 'voidedLineCount', header: 'Voided lines' },
    { key: 'total', header: 'Total' },
];

/** Start and end of a calendar day in the restaurant's timezone, as UTC instants. */
export function dayBoundsUtc(day: Date, timeZone: string): { start: Date; end: Date } {
    // What calendar date is it, in the restaurant's timezone?
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(day);

    // Midnight local, expressed as UTC. Computed by measuring the offset that
    // the zone was actually using at that moment, rather than assuming one.
    const localMidnight = new Date(`${parts}T00:00:00Z`);
    const offsetMs =
        localMidnight.getTime() -
        new Date(
            new Date(localMidnight).toLocaleString('en-US', { timeZone }),
        ).getTime();

    const start = new Date(localMidnight.getTime() + offsetMs);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function formatRupees(cents: number): string {
    return (cents / 100).toFixed(2);
}

export async function exportOrdersCsv(day: Date = new Date()): Promise<string> {
    const { start, end } = dayBoundsUtc(day, env.RESTAURANT_TIMEZONE);

    const orders = await prisma.order.findMany({
        where: { placedAt: { gte: start, lt: end } },
        include: {
            primaryWaiter: { select: { name: true } },
            lines: { select: { unitPriceCents: true, quantity: true, voidedAt: true } },
        },
        orderBy: { placedAt: 'asc' },
    });

    const rows: ExportRow[] = orders.map((order) => ({
        orderId: order.id,
        tableNumber: order.tableNumber,
        status: order.status,
        primaryWaiter: order.primaryWaiter.name,
        placedAt: order.placedAt.toISOString(),
        servedAt: order.servedAt ? order.servedAt.toISOString() : '',
        lineCount: order.lines.length,
        voidedLineCount: order.lines.filter((line: { voidedAt: Date | null }) => line.voidedAt !== null).length,
        total: formatRupees(calculateTotalCents(order.lines)),
    }));

    return toCsv(rows, COLUMNS);
}