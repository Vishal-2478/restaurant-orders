import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { ALERTS_POLL_MS, ALERTS_QUERY_KEY, fetchAlerts } from '../lib/alerts';

const linkBase =
    'rounded-md px-3 py-2 text-sm font-medium transition-colors';

function navClass({ isActive }: { isActive: boolean }) {
    return isActive
        ? `${linkBase} bg-brand-600 text-white`
        : `${linkBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
}

export function Layout() {
    const { user, isManager, logout } = useAuth();

    // Goal 10's nav badge. Polls rather than holding a websocket open — a count
    // that is up to twenty seconds stale is harmless, and this query is shared
    // with the alerts page, so both stay in step without a second request.
    const alertsQuery = useQuery({
        queryKey: ALERTS_QUERY_KEY,
        queryFn: fetchAlerts,
        refetchInterval: ALERTS_POLL_MS,
    });

    const alertCount = alertsQuery.data?.count ?? 0;

    return (
        <div className="min-h-screen">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
                    <span className="text-base font-semibold tracking-tight text-brand-700">
                        Restaurant Orders
                    </span>

                    <nav className="flex items-center gap-1">
                        <NavLink to="/orders" className={navClass}>Orders</NavLink>
                        <NavLink to="/menu" className={navClass}>Menu</NavLink>
                        <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>
                        <NavLink to="/alerts" className={navClass}>
                            Alerts
                            {alertCount > 0 && (
                                <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                                    {alertCount}
                                </span>
                            )}
                        </NavLink>
                    </nav>

                    <div className="ml-auto flex items-center gap-3 text-sm">
                        <span className="text-slate-600">
                            {user?.name}
                            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                {isManager ? 'Manager' : 'Waiter'}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={() => void logout()}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-6">
                <Outlet />
            </main>
        </div>
    );
}
