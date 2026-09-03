import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { formatMoney } from '../lib/format';
import { StatusBadge } from '../components/StatusBadge';
import { ServedPerDayChart } from '../components/ServedPerDayChart';
import type { DashboardData } from '../lib/types';

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>
    );
}

/**
 * Goal 8.
 *
 * Every number here was computed in SQL on the server, including the day
 * bucketing — "today" means today in the restaurant's timezone, not in UTC.
 * The browser does no arithmetic beyond dividing cents by 100 for display.
 */
export function DashboardPage() {
    const dashboardQuery = useQuery({
        queryKey: ['dashboard'],
        queryFn: () => apiFetch<DashboardData>('/api/dashboard'),
    });

    if (dashboardQuery.isPending) {
        return <p className="text-slate-400">Loading dashboard…</p>;
    }

    if (dashboardQuery.isError) {
        return (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                {(dashboardQuery.error as Error).message}
            </div>
        );
    }

    const { summary, byStatus, byWaiter, servedPerDay } = dashboardQuery.data;

    return (
        <div className="space-y-5">
            <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Open orders" value={String(summary.openOrders)} hint="Not yet served or cancelled" />
                <StatTile label="Placed today" value={String(summary.placedToday)} />
                <StatTile label="Served today" value={String(summary.servedToday)} />
                <StatTile
                    label="Revenue today"
                    value={formatMoney(summary.revenueTodayCents)}
                    hint="Non-voided lines on orders served today"
                />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                    <h2 className="text-sm font-semibold">Open orders by status</h2>
                    <ul className="mt-3 space-y-2">
                        {byStatus.length === 0 && <li className="text-sm text-slate-400">Nothing open.</li>}
                        {byStatus.map((row) => (
                            <li key={row.status} className="flex items-center justify-between">
                                <StatusBadge status={row.status} />
                                <span className="text-sm font-medium tabular-nums">{row.count}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
                    <h2 className="text-sm font-semibold">Waiters today</h2>
                    <table className="mt-3 w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="pb-2">Waiter</th>
                                <th className="pb-2 text-right">Orders</th>
                                <th className="pb-2 text-right">Served</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {byWaiter.map((row) => (
                                <tr key={row.id}>
                                    <td className="py-2">{row.name}</td>
                                    <td className="py-2 text-right tabular-nums">{row.ordersToday}</td>
                                    <td className="py-2 text-right tabular-nums">{row.servedToday}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* Every waiter appears, including one with nothing today — the query
              LEFT JOINs from users so a quiet shift shows a zero, not a gap. */}
                </section>
            </div>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold">Orders served per day</h2>
                <p className="mt-0.5 text-xs text-slate-400">Last fourteen days, including days with none.</p>
                <div className="mt-4">
                    <ServedPerDayChart data={servedPerDay} />
                </div>
            </section>
        </div>
    );
}
