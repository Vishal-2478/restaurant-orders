import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

export function LoginPage() {
    const { user, isLoading, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState('manager@restaurant.test');
    const [password, setPassword] = useState('Password123!');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center text-slate-500">
                Loading…
            </div>
        );
    }

    if (user) {
        return <Navigate to="/orders" replace />;
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setBusy(true);

        try {
            await login(email, password);
            const from = (location.state as { from?: string } | null)?.from;
            navigate(from ?? '/orders', { replace: true });
        } catch (caught) {
            // Show the server's own message. It is deliberately identical for a wrong
            // password and an unknown email, so the form must not try to be cleverer.
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : 'Could not reach the server. Is the API running?',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                    Restaurant Orders
                </h1>
                <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            required
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        />
                    </div>

                    {error && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                        {busy ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>

                <div className="mt-6 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500">
                    <p className="font-medium text-slate-600">Demo accounts</p>
                    <p className="mt-1">manager@restaurant.test</p>
                    <p>waiter.a@restaurant.test</p>
                    <p>waiter.b@restaurant.test</p>
                    <p className="mt-1">Password for all three: Password123!</p>
                </div>
            </div>
        </div>
    );
}