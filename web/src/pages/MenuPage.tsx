import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import type { BulkResult, MenuItem } from '../lib/types';

type Draft = {
    id?: string;
    name: string;
    category: string;
    description: string;
    /** Held as rupees for the form; converted to cents on submit. */
    price: string;
    isAvailable: boolean;
};

const EMPTY_DRAFT: Draft = {
    name: '',
    category: '',
    description: '',
    price: '',
    isAvailable: true,
};

/** Rupees typed by a human → integer cents for the API. Rounded, never floored. */
function toCents(rupees: string): number {
    return Math.round(Number(rupees) * 100);
}

export function MenuPage() {
    const { isManager } = useAuth();
    const queryClient = useQueryClient();

    const [includeArchived, setIncludeArchived] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [bulkMode, setBulkMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkPrice, setBulkPrice] = useState('');
    const [bulkAvailability, setBulkAvailability] = useState<'unchanged' | 'true' | 'false'>('unchanged');
    const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

    const menuQuery = useQuery({
        queryKey: ['menu', includeArchived],
        queryFn: () =>
            apiFetch<{ items: MenuItem[] }>(
                `/api/menu${includeArchived ? '?includeArchived=true' : ''}`,
            ),
    });

    const items = menuQuery.data?.items ?? [];

    /** Group by category so the page reads like a menu rather than a table dump. */
    const grouped = useMemo(() => {
        const map = new Map<string, MenuItem[]>();
        for (const item of items) {
            const key = item.category ?? 'Other';
            map.set(key, [...(map.get(key) ?? []), item]);
        }
        return [...map.entries()];
    }, [items]);

    function refresh() {
        return queryClient.invalidateQueries({ queryKey: ['menu'] });
    }

    const saveItem = useMutation({
        mutationFn: async (value: Draft) => {
            const body = {
                name: value.name,
                category: value.category.trim() || null,
                description: value.description.trim() || null,
                priceCents: toCents(value.price),
                isAvailable: value.isAvailable,
            };

            return value.id
                ? apiFetch(`/api/menu/${value.id}`, { method: 'PATCH', body })
                : apiFetch('/api/menu', { method: 'POST', body });
        },
        onMutate: () => setError(null),
        onSuccess: async () => { await refresh(); setDraft(null); },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save the item.'),
    });

    const toggleArchive = useMutation({
        mutationFn: (item: MenuItem) =>
            apiFetch(`/api/menu/${item.id}/${item.archivedAt ? 'restore' : 'archive'}`, {
                method: 'POST',
            }),
        onMutate: () => setError(null),
        onSuccess: refresh,
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not update the item.'),
    });

    const runBulk = useMutation({
        mutationFn: () => {
            const applyToAll: Record<string, unknown> = {};
            if (bulkPrice.trim() !== '') applyToAll.priceCents = toCents(bulkPrice);
            if (bulkAvailability !== 'unchanged') applyToAll.isAvailable = bulkAvailability === 'true';

            return apiFetch<BulkResult>('/api/menu/bulk', {
                method: 'POST',
                body: {
                    applyToAll,
                    items: [...selected].map((id) => ({ id })),
                },
            });
        },
        onMutate: () => { setError(null); setBulkResult(null); },
        onSuccess: async (result) => { setBulkResult(result); await refresh(); },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Bulk update failed.'),
    });

    function toggleSelected(id: string) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const nothingToApply = bulkPrice.trim() === '' && bulkAvailability === 'unchanged';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-lg font-semibold tracking-tight">Menu</h1>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={includeArchived}
                            onChange={(e) => setIncludeArchived(e.target.checked)}
                        />
                        Include archived
                    </label>

                    {/* Manager-only controls. This is a convenience: the API returns 403
              for a waiter whether or not the button is on screen. */}
                    {isManager && (
                        <>
                            <button
                                type="button"
                                onClick={() => { setBulkMode((v) => !v); setSelected(new Set()); setBulkResult(null); }}
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                                {bulkMode ? 'Exit bulk edit' : 'Bulk edit'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDraft({ ...EMPTY_DRAFT })}
                                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                            >
                                New item
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {/* ------------------------------------------------------- bulk panel */}
            {bulkMode && isManager && (
                <div className="space-y-3 rounded-lg border border-brand-500 bg-brand-50 p-4">
                    <p className="text-sm font-medium text-brand-700">
                        Bulk edit — {selected.size} item{selected.size === 1 ? '' : 's'} selected
                    </p>

                    <div className="flex flex-wrap items-end gap-3">
                        <label>
                            <span className="mb-1 block text-xs font-medium text-slate-600">
                                New price (₹)
                            </span>
                            <input
                                type="number" min={0} step="0.01"
                                value={bulkPrice}
                                onChange={(e) => setBulkPrice(e.target.value)}
                                placeholder="Leave blank to keep"
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                            />
                        </label>

                        <label>
                            <span className="mb-1 block text-xs font-medium text-slate-600">Availability</span>
                            <select
                                value={bulkAvailability}
                                onChange={(e) => setBulkAvailability(e.target.value as typeof bulkAvailability)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                            >
                                <option value="unchanged">Leave unchanged</option>
                                <option value="true">Available</option>
                                <option value="false">Unavailable</option>
                            </select>
                        </label>

                        <button
                            type="button"
                            disabled={selected.size === 0 || nothingToApply || runBulk.isPending}
                            onClick={() => runBulk.mutate()}
                            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                            Apply to {selected.size} item{selected.size === 1 ? '' : 's'}
                        </button>
                    </div>

                    {/* Goal 7: the result is reported PER ITEM. One rejected item does not
              undo the others — there is deliberately no transaction on the server. */}
                    {bulkResult && (
                        <div className="rounded-md border border-slate-200 bg-white p-3">
                            <p className="text-sm font-medium">
                                {bulkResult.updated} updated, {bulkResult.failed} rejected
                            </p>
                            <ul className="mt-2 space-y-1 text-sm">
                                {bulkResult.results.map((row) => (
                                    <li key={row.id} className="flex items-start gap-2">
                                        {row.status === 'updated' ? (
                                            <>
                                                <span className="text-emerald-600">✓</span>
                                                <span>
                                                    {row.name} — {formatMoney(row.priceCents)},{' '}
                                                    {row.isAvailable ? 'available' : 'unavailable'}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-red-600">✗</span>
                                                <span className="text-red-700">{row.reason}</span>
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* ------------------------------------------------------- create/edit */}
            {draft && isManager && (
                <form
                    onSubmit={(e) => { e.preventDefault(); saveItem.mutate(draft); }}
                    className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
                >
                    <label className="sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                        <input
                            required autoFocus
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        />
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-medium text-slate-600">Category</span>
                        <input
                            value={draft.category}
                            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        />
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-medium text-slate-600">Price (₹)</span>
                        <input
                            type="number" min={0} step="0.01" required
                            value={draft.price}
                            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        />
                    </label>

                    <label className="sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
                        <input
                            value={draft.description}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        />
                    </label>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={draft.isAvailable}
                            onChange={(e) => setDraft({ ...draft, isAvailable: e.target.checked })}
                        />
                        Available to order
                    </label>

                    <div className="flex justify-end gap-2 sm:col-span-2">
                        <button
                            type="button"
                            onClick={() => setDraft(null)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saveItem.isPending}
                            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {draft.id ? 'Save changes' : 'Create item'}
                        </button>
                    </div>
                </form>
            )}

            {/* -------------------------------------------------------------- list */}
            {menuQuery.isPending && <p className="text-slate-400">Loading menu…</p>}

            {grouped.map(([category, categoryItems]) => (
                <section key={category} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {category}
                    </h2>

                    <ul className="divide-y divide-slate-100">
                        {categoryItems.map((item) => (
                            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                                {bulkMode && isManager && (
                                    <input
                                        type="checkbox"
                                        checked={selected.has(item.id)}
                                        onChange={() => toggleSelected(item.id)}
                                    />
                                )}

                                <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-medium ${item.archivedAt ? 'text-slate-400 line-through' : ''}`}>
                                        {item.name}
                                        {!item.isAvailable && !item.archivedAt && (
                                            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">
                                                Unavailable
                                            </span>
                                        )}
                                        {item.archivedAt && (
                                            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                                                Archived
                                            </span>
                                        )}
                                    </p>
                                    {item.description && (
                                        <p className="truncate text-xs text-slate-500">{item.description}</p>
                                    )}
                                </div>

                                <span className="text-sm font-medium tabular-nums">
                                    {formatMoney(item.priceCents)}
                                </span>

                                {isManager && !bulkMode && (
                                    <div className="flex gap-2 text-xs">
                                        <button
                                            type="button"
                                            disabled={!!item.archivedAt}
                                            onClick={() =>
                                                setDraft({
                                                    id: item.id,
                                                    name: item.name,
                                                    category: item.category ?? '',
                                                    description: item.description ?? '',
                                                    price: (item.priceCents / 100).toFixed(2),
                                                    isAvailable: item.isAvailable,
                                                })
                                            }
                                            className="text-brand-700 hover:underline disabled:text-slate-300 disabled:no-underline"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleArchive.mutate(item)}
                                            className="text-slate-500 hover:text-slate-800"
                                        >
                                            {item.archivedAt ? 'Restore' : 'Archive'}
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
