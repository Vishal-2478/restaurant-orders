import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import { ALLOWED_TRANSITIONS, TRANSITION_LABELS, isEditable } from '../lib/orderStatus';
import { StatusBadge } from '../components/StatusBadge';
import { OrderTimeline } from '../components/OrderTimeline';
import { useAuth } from '../auth/AuthContext';
import type { MenuItem, OrderDetail, OrderStatus, User } from '../lib/types';

export function OrderDetailPage() {
    const { id = '' } = useParams();
    const queryClient = useQueryClient();
    const { user } = useAuth();

    const [actionError, setActionError] = useState<string | null>(null);
    const [voidingLineId, setVoidingLineId] = useState<string | null>(null);
    const [voidReason, setVoidReason] = useState('');
    const [menuItemId, setMenuItemId] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [instructions, setInstructions] = useState('');
    const [note, setNote] = useState('');
    const [collaboratorId, setCollaboratorId] = useState('');

    const orderQuery = useQuery({
        queryKey: ['order', id],
        queryFn: () => apiFetch<OrderDetail>(`/api/orders/${id}`),
    });

    const menuQuery = useQuery({
        queryKey: ['menu', 'available'],
        queryFn: () => apiFetch<{ items: MenuItem[] }>('/api/menu?availableOnly=true'),
    });

    const waitersQuery = useQuery({
        queryKey: ['waiters'],
        queryFn: () => apiFetch<User[]>('/api/users?role=WAITER'),
    });

    /** Every mutation refreshes this order and the list, and surfaces the server's message. */
    function useOrderMutation<TInput>(
        run: (input: TInput) => Promise<unknown>,
        onDone?: () => void,
    ) {
        return useMutation({
            mutationFn: run,
            onMutate: () => setActionError(null),
            onSuccess: async () => {
                await queryClient.invalidateQueries({ queryKey: ['order', id] });
                await queryClient.invalidateQueries({ queryKey: ['orders'] });
                await queryClient.invalidateQueries({ queryKey: ['alerts'] });
                onDone?.();
            },
            onError: (error) =>
                setActionError(error instanceof ApiError ? error.message : 'Something went wrong.'),
        });
    }

    const changeStatus = useOrderMutation((to: OrderStatus) =>
        apiFetch(`/api/orders/${id}/status`, { method: 'POST', body: { to } }),
    );

    const addLine = useOrderMutation(
        () =>
            apiFetch(`/api/orders/${id}/lines`, {
                method: 'POST',
                body: {
                    menuItemId,
                    quantity: Number(quantity),
                    specialInstructions: instructions.trim() || null,
                },
            }),
        () => {
            setMenuItemId('');
            setQuantity('1');
            setInstructions('');
        },
    );

    const voidLine = useOrderMutation(
        (lineId: string) =>
            apiFetch(`/api/orders/${id}/lines/${lineId}/void`, {
                method: 'POST',
                body: { reason: voidReason },
            }),
        () => {
            setVoidingLineId(null);
            setVoidReason('');
        },
    );

    const addCollaborator = useOrderMutation(
        () =>
            apiFetch(`/api/orders/${id}/collaborators`, {
                method: 'POST',
                body: { userId: collaboratorId },
            }),
        () => setCollaboratorId(''),
    );

    const removeCollaborator = useOrderMutation((userId: string) =>
        apiFetch(`/api/orders/${id}/collaborators/${userId}`, { method: 'DELETE' }),
    );

    const addNote = useOrderMutation(
        () => apiFetch(`/api/orders/${id}/notes`, { method: 'POST', body: { message: note } }),
        () => setNote(''),
    );

    const archive = useOrderMutation(() =>
        apiFetch(`/api/orders/${id}/archive`, { method: 'POST' }),
    );

    const restore = useOrderMutation(() =>
        apiFetch(`/api/orders/${id}/restore`, { method: 'POST' }),
    );

    if (orderQuery.isPending) {
        return <p className="text-slate-400">Loading order…</p>;
    }

    if (orderQuery.isError) {
        return (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                {(orderQuery.error as Error).message}
            </div>
        );
    }

    const order = orderQuery.data;
    const editable = isEditable(order.status) && !order.archivedAt;
    const nextStatuses = ALLOWED_TRANSITIONS[order.status];

    const collaboratorIds = new Set(order.collaborators.map((c) => c.userId));
    const availableWaiters = (waitersQuery.data ?? []).filter(
        (waiter) => waiter.id !== order.primaryWaiterId && !collaboratorIds.has(waiter.id),
    );

    return (
        <div className="space-y-5">
            <Link to="/orders" className="text-sm text-slate-500 hover:text-slate-700">
                ← Back to orders
            </Link>

            {/* ----------------------------------------------------------- header */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">
                            Table {order.tableNumber}
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            {order.primaryWaiter.name} · placed {formatDateTime(order.placedAt)}
                            {order.archivedAt && ' · archived'}
                        </p>
                    </div>

                    <div className="text-right">
                        <StatusBadge status={order.status} />
                        <p className="mt-1 text-lg font-semibold">{formatMoney(order.totalCents)}</p>
                    </div>
                </div>

                {/* Only the moves the state machine actually allows are offered. The
            server checks again regardless — this just avoids inviting a 409. */}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {nextStatuses.map((status) => (
                        <button
                            key={status}
                            type="button"
                            disabled={changeStatus.isPending || !!order.archivedAt}
                            onClick={() => changeStatus.mutate(status)}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${status === 'CANCELLED'
                                    ? 'border border-red-300 text-red-700 hover:bg-red-50'
                                    : 'bg-brand-600 text-white hover:bg-brand-700'
                                }`}
                        >
                            {TRANSITION_LABELS[status]}
                        </button>
                    ))}

                    {nextStatuses.length === 0 && (
                        <p className="text-sm text-slate-400">
                            This order is finished. Its status cannot change again.
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={() => (order.archivedAt ? restore.mutate(undefined) : archive.mutate(undefined))}
                        className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        {order.archivedAt ? 'Restore' : 'Archive'}
                    </button>
                </div>

                {/* The server's own sentence, shown verbatim. Goal 4 asks for a message
            explaining why a move was refused; inventing our own would lose it. */}
                {actionError && (
                    <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                        {actionError}
                    </p>
                )}
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                    {/* ---------------------------------------------------------- lines */}
                    <section className="rounded-lg border border-slate-200 bg-white">
                        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
                            Items
                        </h2>

                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100">
                                {order.lines.length === 0 && (
                                    <tr><td className="px-4 py-6 text-center text-slate-400">No items yet.</td></tr>
                                )}

                                {order.lines.map((line) => {
                                    const voided = line.voidedAt !== null;
                                    return (
                                        <tr key={line.id} className={voided ? 'text-slate-400' : ''}>
                                            <td className="px-4 py-2.5">
                                                <span className={voided ? 'line-through' : 'font-medium'}>
                                                    {line.quantity} × {line.menuItemName}
                                                </span>
                                                {line.specialInstructions && (
                                                    <p className="text-xs text-slate-500">{line.specialInstructions}</p>
                                                )}
                                                {voided && (
                                                    <p className="text-xs text-red-500">Voided — {line.voidReason}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-slate-500">
                                                {/* The price stored ON THE LINE, not today's menu price. */}
                                                {formatMoney(line.unitPriceCents)} each
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-medium">
                                                <span className={voided ? 'line-through' : ''}>
                                                    {formatMoney(line.unitPriceCents * line.quantity)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                {!voided && editable && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setVoidingLineId(line.id); setVoidReason(''); }}
                                                        className="text-xs text-red-600 hover:underline"
                                                    >
                                                        Void
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-slate-200 bg-slate-50">
                                <tr>
                                    <td className="px-4 py-2.5 font-medium" colSpan={2}>Total</td>
                                    <td className="px-4 py-2.5 text-right font-semibold">
                                        {formatMoney(order.totalCents)}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>

                        {/* A void REQUIRES a reason — enforced by the API and by a database
                CHECK constraint. The form simply cannot submit without one. */}
                        {voidingLineId && (
                            <div className="border-t border-slate-100 bg-red-50/50 px-4 py-3">
                                <label className="block text-sm font-medium text-slate-700">
                                    Why is this line being voided?
                                </label>
                                <div className="mt-2 flex gap-2">
                                    <input
                                        autoFocus
                                        value={voidReason}
                                        onChange={(e) => setVoidReason(e.target.value)}
                                        placeholder="Required"
                                        className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                    />
                                    <button
                                        type="button"
                                        disabled={!voidReason.trim() || voidLine.isPending}
                                        onClick={() => voidLine.mutate(voidingLineId)}
                                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                                    >
                                        Void line
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setVoidingLineId(null)}
                                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {editable && (
                            <form
                                onSubmit={(e) => { e.preventDefault(); addLine.mutate(undefined); }}
                                className="flex flex-wrap items-end gap-2 border-t border-slate-100 px-4 py-3"
                            >
                                <label className="min-w-48 flex-1">
                                    <span className="mb-1 block text-xs font-medium text-slate-600">Add item</span>
                                    <select
                                        required
                                        value={menuItemId}
                                        onChange={(e) => setMenuItemId(e.target.value)}
                                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                    >
                                        <option value="">Choose…</option>
                                        {menuQuery.data?.items.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} — {formatMoney(item.priceCents)}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="w-20">
                                    <span className="mb-1 block text-xs font-medium text-slate-600">Qty</span>
                                    <input
                                        type="number" min={1} max={99} required
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                    />
                                </label>

                                <label className="min-w-40 flex-1">
                                    <span className="mb-1 block text-xs font-medium text-slate-600">
                                        Special instructions
                                    </span>
                                    <input
                                        value={instructions}
                                        onChange={(e) => setInstructions(e.target.value)}
                                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                    />
                                </label>

                                <button
                                    type="submit"
                                    disabled={addLine.isPending}
                                    className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </form>
                        )}
                    </section>

                    {/* -------------------------------------------------------- timeline */}
                    <section className="rounded-lg border border-slate-200 bg-white p-4">
                        <h2 className="text-sm font-semibold">History</h2>
                        <p className="mt-0.5 text-xs text-slate-400">
                            Append-only. Nothing here can be edited or deleted, including by a manager.
                        </p>
                        <div className="mt-3">
                            <OrderTimeline events={order.events} />
                        </div>

                        <form
                            onSubmit={(e) => { e.preventDefault(); addNote.mutate(undefined); }}
                            className="mt-4 flex gap-2 border-t border-slate-100 pt-3"
                        >
                            <input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Add a note to this order…"
                                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                            />
                            <button
                                type="submit"
                                disabled={!note.trim() || addNote.isPending}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
                            >
                                Add note
                            </button>
                        </form>
                    </section>
                </div>

                {/* --------------------------------------------------- collaborators */}
                <section className="h-fit rounded-lg border border-slate-200 bg-white p-4">
                    <h2 className="text-sm font-semibold">Waiters</h2>

                    <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span>{order.primaryWaiter.name}</span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                Primary
                            </span>
                        </div>

                        {order.collaborators.map((collaborator) => (
                            <div key={collaborator.userId} className="flex items-center justify-between">
                                <span>{collaborator.user.name}</span>
                                <button
                                    type="button"
                                    onClick={() => removeCollaborator.mutate(collaborator.userId)}
                                    className="text-xs text-slate-400 hover:text-red-600"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}

                        {order.collaborators.length === 0 && (
                            <p className="text-xs text-slate-400">No collaborators yet.</p>
                        )}
                    </div>

                    <form
                        onSubmit={(e) => { e.preventDefault(); addCollaborator.mutate(undefined); }}
                        className="mt-4 space-y-2 border-t border-slate-100 pt-3"
                    >
                        <select
                            value={collaboratorId}
                            onChange={(e) => setCollaboratorId(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                        >
                            <option value="">Add a collaborator…</option>
                            {availableWaiters.map((waiter) => (
                                <option key={waiter.id} value={waiter.id}>{waiter.name}</option>
                            ))}
                        </select>
                        <button
                            type="submit"
                            disabled={!collaboratorId || addCollaborator.isPending}
                            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
                        >
                            Add
                        </button>
                    </form>

                    <p className="mt-3 text-xs text-slate-400">
                        Collaborators can act on this order. You are signed in as {user?.name}.
                    </p>
                </section>
            </div>
        </div>
    );
}
