import { useState } from 'react';

type Point = { day: string; served: number };

/**
 * Orders served per day, last fourteen days.
 *
 * Hand-built rather than pulled from a chart library: it is one series of
 * fourteen values, and a library would be more code to configure than this is
 * to read.
 *
 * The array ALWAYS has fourteen entries, including days with zero — the server
 * generates the date series and left joins counts onto it. Days with no orders
 * are the point, not noise: dropping them would draw Monday next to Wednesday
 * and turn a quiet Tuesday into a Tuesday that never happened.
 */
export function ServedPerDayChart({ data }: { data: Point[] }) {
    const [hovered, setHovered] = useState<number | null>(null);

    // Never divide by zero, and give a flat run of zeroes a sensible axis.
    const max = Math.max(1, ...data.map((point) => point.served));

    return (
        <div>
            <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Orders served per day over the last fourteen days">
                {data.map((point, index) => {
                    const heightPercent = (point.served / max) * 100;
                    const isHovered = hovered === index;

                    return (
                        <div
                            key={point.day}
                            className="relative flex flex-1 flex-col justify-end"
                            onMouseEnter={() => setHovered(index)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            {isHovered && (
                                <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow">
                                    {new Date(point.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    {' · '}
                                    {point.served} served
                                </div>
                            )}

                            {/* A zero day still gets a 2px stub, so it reads as "nothing here"
                  rather than as a missing bar. */}
                            <div
                                className={`w-full rounded-t transition-colors ${isHovered ? 'bg-brand-700' : 'bg-brand-500'
                                    }`}
                                style={{ height: point.served === 0 ? '2px' : `${Math.max(heightPercent, 4)}%` }}
                            />
                        </div>
                    );
                })}
            </div>

            <div className="mt-2 flex gap-1.5 text-[10px] text-slate-400">
                {data.map((point, index) => (
                    <span key={point.day} className="flex-1 text-center">
                        {/* Only every third label, so they do not collide. */}
                        {index % 3 === 0
                            ? new Date(point.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                            : ''}
                    </span>
                ))}
            </div>
        </div>
    );
}
