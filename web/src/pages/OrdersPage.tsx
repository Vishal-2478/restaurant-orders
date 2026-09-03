import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ORDER_STATUSES, STATUS_LABELS, StatusBadge } from '../components/StatusBadge';
import { buildQuery, fetchOrders, fetchWaiters } from '../lib/queries';
import { downloadFile } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import type { OrderStatus } from '../lib/types';

const PAGE_SIZE = 20;

/**
 * Goal 6.
 *
 * Every control below maps to a query parameter that the SERVER acts on. The
 * browser receives one page of results and a total count; it never receives the
 * whole table and never filters or sorts a list itself. The brief is explicit
 * about this: "do not load every order into the browser and filter there."
 *
 * The filters live in the URL rather than in component state, so the back
 * button works, a filtered view can be shared as a link, and a refresh does not
 * silently reset what you were looking at.
 */
export function OrdersPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    // Default: only my orders. Decision 16 — waiters may view everything but the
    // list they work from is theirs.
    const mineOnly = (searchParams.get('mineOnly') ?? 'true') === 'true';
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const tableNumber = searchParams.get('tableNumber') ?? '';
    const waiterId = searchParams.get('waiterId') ?? '';
    const placedFrom = searchParams.get('placedFrom') ?? '';
    const placedTo = searchParams.get('placedTo') ?? '';
    const sortBy = searchParams.get('sortBy') ?? 'placedAt';
    const sortDirection = searchParams.get('sortDirection') ?? 'desc';
    const statuses = searchParams.getAll('status') as OrderStatus[];

    // Everything the query depends on already lives in the URL, so searchParams is
    // the only dependency. Reading the values inside also keeps this honest: the
    // request and the controls can never disagree about what is being filtered.
    const query = useMemo(() => {
        const statusList = searchParams.getAll('status');

        return buildQuery({
            tableNumber: searchParams.get('tableNumber') || undefined,
            status: statusList.length ? statusList : undefined,
            waiterId: searchParams.get('waiterId') || undefined,
            placedFrom: searchParams.get('placedFrom') || undefined,
            placedTo: searchParams.get('placedTo') || undefined,
            mineOnly: (searchParams.get('mineOnly') ?? 'true') === 'true' ? 'true' : undefined,
            includeArchived: searchParams.get('includeArchived') === 'true' ? 'true' : undefined,
            sortBy: searchParams.get('sortBy') ?? 'placedAt',
            sortDirection: searchParams.get('sortDirection') ?? 'desc',
            page: Number(searchParams.get('page') ?? '1'),
            pageSize: PAGE_SIZE,
        });
    }, [searchParams]);

    const ordersQuery = useQuery({
        queryKey: ['orders', query],
        queryFn: () => fetchOrders(query),
        placeholderData: (previous) => previous,
    });

    const waitersQuery = useQuery({ queryKey: ['waiters'], queryFn: fetchWaiters });

    /** Change one filter and always reset to page 1 — page 7 of a new filter is meaningless. */
    function updateFilter(key: string, value: string | null) {
        const next = new URLSearchParams(searchParams);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        next.delete('page');
        setSearchParams(next, { replace: true });
    }

    function toggleStatus(status: OrderStatus) {
        const next = new URLSearchParams(searchParams);
        const current = next.getAll('status');
        next.delete('status');
        const updated = current.includes(status)
            ? current.filter((s) => s !== status)
            : [...current, status];
        for (const s of updated) next.append('status', s);
        next.delete('page');
        setSearchParams(next, { replace: true });
    }

    function goToPage(target: number) {
        const next = new URLSearchParams(searchParams);
        next.set('page', String(target));
        setSearchParams(next, { replace: true });
    }

    const data = ordersQuery.data;
    const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
    const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold tracking-tight">Orders</h1>
                <div className="flex items-center gap-2">
                    {/* Goal 7: CSV of today's orders. Fetched with the auth header and
              saved as a blob, because a plain link cannot send one. */}
                    <button
                        type="button"
                        onClick={() => {
                            const today = new Date().toISOString().slice(0, 10);
                            void downloadFile('/api/orders/export.csv', `orders-${today}.csv`);
                        }}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        Export today (CSV)
                    </button>

                    <Link
                        to="/orders/new"
                        className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                    >
                        New order
                    </Link>
                </div>
            </div>

            {/* ---------------------------------------------------------- filters */}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">
                            Table number
                        </span>
                        <input
                            type="number"
                            min={1}
                            value={tableNumber}
                            onChange={(e) => updateFilter('tableNumber', e.target.value)}
                            placeholder="Exact match"
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Waiter</span>
                        <select
                            value={waiterId}
                            onChange={(e) => updateFilter('waiterId', e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        >
                            <option value="">Anyone</option>
                            {waitersQuery.data?.map((waiter) => (
                                <option key={waiter.id} value={waiter.id}>{waiter.name}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Placed from</span>
                        <input
                            type="date"
                            value={placedFrom}
                            onChange={(e) => updateFilter('placedFrom', e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Placed to</span>
                        <input
                            type="date"
                            value={placedTo}
                            onChange={(e) => updateFilter('placedTo', e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        />
                    </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">Status</span>
                    {ORDER_STATUSES.map((status) => {
                        const active = statuses.includes(status);
                        return (
                            <button
                                key={status}
                                type="button"
                                onClick={() => toggleStatus(status)}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${active
                                        ? 'bg-brand-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {STATUS_LABELS[status]}
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={mineOnly}
                            onChange={(e) => updateFilter('mineOnly', e.target.checked ? 'true' : 'false')}
                        />
                        Only my orders
                    </label>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={includeArchived}
                            onChange={(e) => updateFilter('includeArchived', e.target.checked ? 'true' : null)}
                        />
                        Include archived
                    </label>

                    <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
                        Sort
                        <select
                            value={sortBy}
                            onChange={(e) => updateFilter('sortBy', e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                            <option value="placedAt">Placed time</option>
                            <option value="status">Status</option>
                            <option value="tableNumber">Table</option>
                        </select>
                        <select
                            value={sortDirection}
                            onChange={(e) => updateFilter('sortDirection', e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                            <option value="desc">Newest first</option>
                            <option value="asc">Oldest first</option>
                        </select>
                    </label>

                    <button
                        type="button"
                        onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
                        className="text-sm text-slate-500 underline hover:text-slate-700"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* ------------------------------------------------------------ table */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                            <th className="px-4 py-2.5">Table</th>
                            <th className="px-4 py-2.5">Status</th>
                            <th className="px-4 py-2.5">Primary waiter</th>
                            <th className="px-4 py-2.5">Placed</th>
                            <th className="px-4 py-2.5 text-right">Lines</th>
                            <th className="px-4 py-2.5 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {ordersQuery.isPending && (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
                        )}

                        {ordersQuery.isError && (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-red-600">
                                    {(ordersQuery.error as Error).message}
                                </td>
                            </tr>
                        )}

                        {data?.orders.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                                    No orders match these filters.
                                </td>
                            </tr>
                        )}

                        {data?.orders.map((order) => (
                            <tr key={order.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5">
                                    <Link to={`/orders/${order.id}`} className="font-medium text-brand-700 hover:underline">
                                        Table {order.tableNumber}
                                    </Link>
                                    {order.archivedAt && (
                                        <span className="ml-2 text-xs text-slate-400">archived</span>
                                    )}
                                </td>
                                <td className="px-4 py-2.5"><StatusBadge status={order.status} /></td>
                                <td className="px-4 py-2.5 text-slate-600">{order.primaryWaiter.name}</td>
                                <td className="px-4 py-2.5 text-slate-600">{formatDateTime(order.placedAt)}</td>
                                <td className="px-4 py-2.5 text-right text-slate-600">{order.lineCount}</td>
                                <td className="px-4 py-2.5 text-right font-medium">{formatMoney(order.totalCents)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ------------------------------------------------------- pagination */}
            {data && data.total > 0 && (
                <div className="flex items-center justify-between text-sm text-slate-600">
                    {/* The total comes from the server's COUNT — the browser has only this page. */}
                    <span>Showing {from}–{to} of {data.total}</span>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={data.page <= 1}
                            onClick={() => goToPage(data.page - 1)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <span>Page {data.page} of {data.totalPages}</span>
                        <button
                            type="button"
                            disabled={data.page >= data.totalPages}
                            onClick={() => goToPage(data.page + 1)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
