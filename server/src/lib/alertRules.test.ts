import { describe, expect, it } from 'vitest';
import { isAlerting } from './alertRules';

const PLACED = new Date('2026-09-02T10:00:00Z');
const at = (minutes: number) => new Date(PLACED.getTime() + minutes * 60_000);

const check = (nowMinutes: number, ackMinutes: number | null) =>
    isAlerting({
        placedAt: PLACED,
        lastAcknowledgedAt: ackMinutes === null ? null : at(ackMinutes),
        now: at(nowMinutes),
        slowOrderMinutes: 15,
        alertSnoozeMinutes: 10,
    });

describe('isAlerting', () => {
    it('does not alert before the threshold', () => {
        expect(check(14, null)).toBe(false);
    });

    it('alerts exactly at the threshold', () => {
        expect(check(15, null)).toBe(true);
    });

    it('alerts while open and never acknowledged', () => {
        expect(check(40, null)).toBe(true);
    });

    it('goes quiet once acknowledged', () => {
        // Acknowledged at minute 16, now minute 20: only 4 minutes of snooze used.
        expect(check(20, 16)).toBe(false);
    });

    it('stays quiet right up to the end of the snooze window', () => {
        expect(check(25, 16)).toBe(false);
    });

    it('comes back when the snooze expires', () => {
        // Acknowledged at 16, now 26: ten minutes later, so it re-arms.
        expect(check(26, 16)).toBe(true);
    });

    it('can be acknowledged again and go quiet again', () => {
        expect(check(30, 28)).toBe(false);
        expect(check(38, 28)).toBe(true);
    });

    it('a stale acknowledgement never suppresses a fresh alert', () => {
        expect(check(120, 16)).toBe(true);
    });
});