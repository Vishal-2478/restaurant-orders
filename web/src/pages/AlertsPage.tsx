import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { ALERTS_POLL_MS, ALERTS_QUERY_KEY, fetchAlerts } from '../lib/alerts';
import { StatusBadge } from '../components/StatusBadge';

/**
 * Goal 10.
 *
 * There is no alert state anywhere in the database. The server works out which
 * orders are alerting each time this endpoint is called, from three facts it
 * already has: the order is open and not yet Ready, it was placed more than
 * SLOW_ORDER_MINUTES ago, and its most recent acknowledgement is either absent
 * or older than ALERT_SNOOZE_MINUTES.
 *
 * Acknowledging INSERTS a timestamped row. It clears no flag — which is exactly
 * why an alert comes back on its own once the snooze expires, with nothing
 * scheduled to bring it back.
 */
export function AlertsPage() {
    const queryClient = useQueryClient();

    const alertsQuery = useQuery({
        queryKey: ALERTS_QUERY_KEY,
        queryFn: fetchAlerts,
        refetchInterval: ALERTS_POLL_MS,
    });

    const acknowledge = useMutation({
        mutationFn: (orderId: string) =>
            apiFetch(`/api/orders/${orderId}/alerts/ack`, { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
    });

    if (alertsQuery.isPending) {
        return <p className="text-slate-400">Loading alerts…</p>;
    }

    if (alertsQuery.isError) {
        return (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                {(alertsQuery.error as Error).message}
            </div>
        );
    }

    const { alerts } = alertsQuery.data;

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold tracking-tight">Slow orders</h1>
                <p className="mt-0.5 text-sm text-slate-500">
                    Open longer than fifteen minutes without reaching Ready. Acknowledging quietens an
                    alert for ten minutes; if the order is still not ready after that, it returns.
                </p>
            </div>

            {alerts.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
                    <p className="text-sm font-medium text-slate-600">Nothing is running late.</p>
                    <p className="mt-1 text-xs text-slate-400">
                        Every open order has either reached Ready or was placed in the last fifteen minutes.
                    </p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {alerts.map((alert) => (
                        <li
                            key={alert.orderId}
                            className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">
                                    <Link to={`/orders/${alert.orderId}`} className="text-brand-700 hover:underline">
                                        Table {alert.tableNumber}
                                    </Link>
                                    <span className="ml-2 font-normal text-slate-600">
                                        open {alert.minutesOpen} minutes
                                    </span>
                                    {/* An alert that was acknowledged and has come back. Nothing
                      scheduled this — the snooze simply expired. */}
                                    {alert.reArmed && (
                                        <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                            Returned
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {alert.primaryWaiter.name} · placed {formatDateTime(alert.placedAt)}
                                    {alert.lastAcknowledgedAt &&
                                        ` · acknowledged ${formatDateTime(alert.lastAcknowledgedAt)}`}
                                </p>
                            </div>

                            <StatusBadge status={alert.status} />

                            <button
                                type="button"
                                disabled={acknowledge.isPending}
                                onClick={() => acknowledge.mutate(alert.orderId)}
                                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                                Acknowledge
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {acknowledge.isError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {acknowledge.error instanceof ApiError
                        ? acknowledge.error.message
                        : 'Could not acknowledge that alert.'}
                </p>
            )}
        </div>
    );
}
