import { describe, expect, it } from 'vitest';
import { calculateTotalCents } from './orderTotals';

const line = (unitPriceCents: number, quantity: number, voidedAt: Date | null = null) => ({
    unitPriceCents,
    quantity,
    voidedAt,
});

describe('calculateTotalCents', () => {
    it('is zero for an empty order', () => {
        expect(calculateTotalCents([])).toBe(0);
    });

    it('multiplies unit price by quantity', () => {
        expect(calculateTotalCents([line(42000, 2)])).toBe(84000);
    });

    it('sums every line', () => {
        expect(calculateTotalCents([line(42000, 2), line(8000, 3)])).toBe(108000);
    });

    it('ignores voided lines', () => {
        const total = calculateTotalCents([
            line(42000, 2),
            line(48000, 1, new Date('2026-09-02T10:00:00Z')),
        ]);
        expect(total).toBe(84000);
    });

    it('stays an exact integer where a float would drift', () => {
        // 0.1 + 0.2 !== 0.3 in floating point. In cents this is just arithmetic.
        expect(calculateTotalCents([line(10, 1), line(20, 1)])).toBe(30);
    });
});