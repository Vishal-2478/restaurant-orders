/**
 * The slow-order alert rule, with no database and no clock of its own.
 *
 * Keeping this pure is what makes the re-arm behaviour testable: the test can
 * simply say "pretend it is now 25 minutes later" instead of waiting.
 */
export type AlertInput = {
    placedAt: Date;
    /** Timestamp of the most recent acknowledgement, or null if never acknowledged. */
    lastAcknowledgedAt: Date | null;
    now: Date;
    slowOrderMinutes: number;
    alertSnoozeMinutes: number;
};

const MINUTE = 60_000;

export function minutesBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / MINUTE);
}

/**
 * An order alerts when it has been open longer than the threshold AND it is
 * not currently snoozed by a recent acknowledgement.
 *
 * Callers must have already filtered to orders that are open and not yet
 * Ready; this function only answers the timing half of the question.
 */
export function isAlerting(input: AlertInput): boolean {
    const openMinutes = minutesBetween(input.placedAt, input.now);

    if (openMinutes < input.slowOrderMinutes) {
        return false;
    }

    if (input.lastAcknowledgedAt === null) {
        return true;
    }

    // Acknowledged, but long enough ago that the snooze has expired: the alert
    // comes back. Nothing had to be scheduled for this to happen.
    return minutesBetween(input.lastAcknowledgedAt, input.now) >= input.alertSnoozeMinutes;
}