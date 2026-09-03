import { formatDateTime } from '../lib/format';
import { STATUS_LABELS } from './StatusBadge';
import type { OrderEvent } from '../lib/types';

const DOT_COLOURS: Record<string, string> = {
    ORDER_CREATED: 'bg-slate-400',
    STATUS_CHANGED: 'bg-blue-500',
    LINE_ADDED: 'bg-brand-500',
    LINE_VOIDED: 'bg-red-500',
    COLLABORATOR_ADDED: 'bg-purple-500',
    COLLABORATOR_REMOVED: 'bg-purple-400',
    NOTE_ADDED: 'bg-amber-500',
    ORDER_ARCHIVED: 'bg-slate-400',
    ORDER_RESTORED: 'bg-slate-400',
};

function describe(event: OrderEvent): string {
    if (event.type === 'STATUS_CHANGED' && event.fromStatus && event.toStatus) {
        return `Status changed from ${STATUS_LABELS[event.fromStatus]} to ${STATUS_LABELS[event.toStatus]}`;
    }
    if (event.message) return event.message;

    switch (event.type) {
        case 'ORDER_ARCHIVED': return 'Order archived';
        case 'ORDER_RESTORED': return 'Order restored';
        case 'COLLABORATOR_REMOVED': return 'A collaborator was removed';
        default: return event.type.toLowerCase().replace(/_/g, ' ');
    }
}

/**
 * Goal 9. This is a read-only view by design: there is no edit or delete
 * control here, there is no API route that could serve one, and the database
 * itself rejects UPDATE and DELETE on the events table.
 */
export function OrderTimeline({ events }: { events: OrderEvent[] }) {
    if (events.length === 0) {
        return <p className="text-sm text-slate-400">No history yet.</p>;
    }

    return (
        <ol className="space-y-3">
            {events.map((event) => (
                <li key={event.id} className="flex gap-3">
                    <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLOURS[event.type] ?? 'bg-slate-400'}`}
                        aria-hidden
                    />
                    <div className="min-w-0">
                        <p className="text-sm text-slate-800">{describe(event)}</p>
                        <p className="text-xs text-slate-500">
                            {event.actor.name} · {formatDateTime(event.createdAt)}
                        </p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
