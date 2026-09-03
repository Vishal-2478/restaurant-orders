import { apiFetch } from './api';
import type { AlertsResponse } from './types';

export const ALERTS_QUERY_KEY = ['alerts'] as const;

/**
 * Polled every twenty seconds.
 *
 * Decision 15: no websockets. An alert count that is up to twenty seconds stale
 * does not affect the workflow, and a persistent connection on a free hosting
 * tier is a liability — it has to be kept alive, reconnected, and debugged when
 * it silently dies.
 */
export const ALERTS_POLL_MS = 20_000;

export function fetchAlerts(): Promise<AlertsResponse> {
    return apiFetch<AlertsResponse>('/api/orders/alerts');
}