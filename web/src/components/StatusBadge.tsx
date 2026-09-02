import type { OrderStatus } from '../lib/types';

const STYLES: Record<OrderStatus, string> = {
    PLACED: 'bg-slate-100 text-slate-700',
    ACCEPTED: 'bg-blue-100 text-blue-700',
    PREPARING: 'bg-amber-100 text-amber-800',
    READY: 'bg-brand-100 text-brand-700',
    SERVED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-red-100 text-red-700',
};

const LABELS: Record<OrderStatus, string> = {
    PLACED: 'Placed',
    ACCEPTED: 'Accepted',
    PREPARING: 'Preparing',
    READY: 'Ready',
    SERVED: 'Served',
    CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
    return (
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
            {LABELS[status]}
        </span>
    );
}
// eslint-disable-next-line react-refresh/only-export-components
export const ORDER_STATUSES: OrderStatus[] = [
    'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED',
];

export const STATUS_LABELS = LABELS;