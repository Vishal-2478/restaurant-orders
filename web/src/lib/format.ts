/**
 * Money is stored and sent as an integer number of cents, everywhere.
 * This is the ONLY place in the frontend that divides by 100.
 */
export function formatMoney(cents: number): string {
    return `₹${(cents / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
    });
}