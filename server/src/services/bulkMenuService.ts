import { prisma } from '../db';

/**
 * Goal 7 — bulk price and availability updates.
 *
 * The brief is specific: the result must report PER ITEM what succeeded and
 * what was rejected and why, and one bad item must never fail the whole batch.
 *
 * That rules out wrapping the loop in a transaction. A transaction is
 * all-or-nothing, which is the opposite of what is being asked for here: a
 * manager updating twenty prices should not lose nineteen good edits because
 * the twentieth item was archived last week.
 */

export type BulkChange = {
    priceCents?: number;
    isAvailable?: boolean;
};

export type BulkMenuUpdateInput = {
    /** Per-item values. An item may override the shared change, or stand alone. */
    items: ({ id: string } & BulkChange)[];
    /** Optional one-value-for-all, applied to every item that does not override it. */
    applyToAll?: BulkChange;
};

export type BulkResultRow =
    | {
        id: string;
        status: 'updated';
        name: string;
        priceCents: number;
        isAvailable: boolean;
    }
    | { id: string; status: 'failed'; reason: string };

export type BulkMenuUpdateResult = {
    results: BulkResultRow[];
    updated: number;
    failed: number;
};

export async function bulkUpdateMenuItems(
    input: BulkMenuUpdateInput,
): Promise<BulkMenuUpdateResult> {
    const results: BulkResultRow[] = [];
    const seen = new Set<string>();

    for (const entry of input.items) {
        // Per-item values win over the shared change.
        const change: BulkChange = {
            ...input.applyToAll,
            ...(entry.priceCents !== undefined ? { priceCents: entry.priceCents } : {}),
            ...(entry.isAvailable !== undefined ? { isAvailable: entry.isAvailable } : {}),
        };

        if (seen.has(entry.id)) {
            results.push({
                id: entry.id,
                status: 'failed',
                reason: 'This item appears more than once in the request.',
            });
            continue;
        }
        seen.add(entry.id);

        if (change.priceCents === undefined && change.isAvailable === undefined) {
            results.push({
                id: entry.id,
                status: 'failed',
                reason: 'No change was given for this item.',
            });
            continue;
        }

        if (change.priceCents !== undefined && change.priceCents < 0) {
            results.push({
                id: entry.id,
                status: 'failed',
                reason: 'Price cannot be negative.',
            });
            continue;
        }

        const existing = await prisma.menuItem.findUnique({ where: { id: entry.id } });

        if (!existing) {
            results.push({ id: entry.id, status: 'failed', reason: 'Menu item not found.' });
            continue;
        }

        if (existing.archivedAt) {
            results.push({
                id: entry.id,
                status: 'failed',
                reason: `"${existing.name}" is archived and cannot be updated.`,
            });
            continue;
        }

        // Each item is its own write. A failure here is caught and reported
        // alongside the successes rather than aborting the run.
        try {
            const updated = await prisma.menuItem.update({
                where: { id: entry.id },
                data: {
                    ...(change.priceCents !== undefined ? { priceCents: change.priceCents } : {}),
                    ...(change.isAvailable !== undefined ? { isAvailable: change.isAvailable } : {}),
                },
            });

            results.push({
                id: updated.id,
                status: 'updated',
                name: updated.name,
                priceCents: updated.priceCents,
                isAvailable: updated.isAvailable,
            });
        } catch {
            results.push({
                id: entry.id,
                status: 'failed',
                reason: 'The database rejected this update.',
            });
        }
    }

    return {
        results,
        updated: results.filter((row) => row.status === 'updated').length,
        failed: results.filter((row) => row.status === 'failed').length,
    };
}