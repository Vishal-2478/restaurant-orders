import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const linkBase =
    'rounded-md px-3 py-2 text-sm font-medium transition-colors';

function navClass({ isActive }: { isActive: boolean }) {
    return isActive
        ? `${linkBase} bg-brand-600 text-white`
        : `${linkBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
}

export function Layout() {
    const { user, isManager, logout } = useAuth();

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
                        <NavLink to="/alerts" className={navClass}>Alerts</NavLink>
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