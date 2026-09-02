import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../lib/api';

/**
 * Goal 2. The only thing sent is the table number — the server takes the
 * primary waiter from the access token, so a waiter cannot file an order
 * under someone else's name.
 */
export function NewOrderPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [tableNumber, setTableNumber] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setBusy(true);

        try {
            const order = await apiFetch<{ id: string }>('/api/orders', {
                method: 'POST',
                body: { tableNumber: Number(tableNumber) },
            });
            await queryClient.invalidateQueries({ queryKey: ['orders'] });
            navigate(`/orders/${order.id}`, { replace: true });
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="max-w-sm">
            <h1 className="text-lg font-semibold tracking-tight">New order</h1>
            <p className="mt-1 text-sm text-slate-500">
                You become the primary waiter for this order.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Table number</span>
                    <input
                        type="number"
                        min={1}
                        required
                        autoFocus
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                </label>

                {error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                <div className="flex gap-2">
                    <button
                        type="submit"
                        disabled={busy}
                        className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                        {busy ? 'Creating…' : 'Create order'}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/orders')}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}