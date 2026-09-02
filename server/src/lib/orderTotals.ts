/**
 * The parts of an order line that affect the total. Deliberately not Prisma's
 * `OrderLine` type: keeping this file free of imports means the totals can be
 * unit-tested without a database connection or any environment variables.
 */
export type LineForTotal = {
    unitPriceCents: number;
    quantity: number;
    voidedAt: Date | null;
};

/**
 * Goal 3: the total is computed by the server from the price stored on each
 * line at the time it was added. Voided lines do not count towards it.
 *
 * Everything here is integer cents, so the arithmetic is exact.
 */
export function calculateTotalCents(lines: LineForTotal[]): number {
    return lines
        .filter((line) => line.voidedAt === null)
        .reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
}