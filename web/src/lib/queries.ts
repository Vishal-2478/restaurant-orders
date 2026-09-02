import { apiFetch } from './api';
import type { OrderListResponse, User } from './types';

/** Turns a filter object into a query string, dropping anything unset. */
export function buildQuery(params: Record<string, string | number | boolean | string[] | undefined>): string {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '' || value === null) continue;

        if (Array.isArray(value)) {
            // The API accepts a repeated key: ?status=PLACED&status=ACCEPTED
            for (const entry of value) search.append(key, entry);
        } else {
            search.set(key, String(value));
        }
    }

    const query = search.toString();
    return query ? `?${query}` : '';
}

export function fetchOrders(query: string): Promise<OrderListResponse> {
    return apiFetch<OrderListResponse>(`/api/orders${query}`);
}

export function fetchWaiters(): Promise<User[]> {
    // Note: this endpoint returns a bare array, not { users: [...] }.
    return apiFetch<User[]>('/api/users?role=WAITER');
}