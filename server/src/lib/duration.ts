const PATTERN = /^(\d+)([smhd])$/;

const MULTIPLIER: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
};

export function durationToMs(value: string): number {
    const match = PATTERN.exec(value.trim());
    if (!match) {
        throw new Error(`Cannot parse duration "${value}". Expected a form like 15m, 24h or 7d.`);
    }
    const [, amount, unit] = match;
    return Number(amount) * MULTIPLIER[unit as keyof typeof MULTIPLIER]!;
}