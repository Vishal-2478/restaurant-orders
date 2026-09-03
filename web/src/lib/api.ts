import type { AuthResponse } from './types';

const BASE_URL = import.meta.env.VITE_API_URL as string;
const REFRESH_STORAGE_KEY = 'restaurant-orders.refreshToken';

/**
 * The access token lives in memory only, never in localStorage.
 *
 * It is a bearer credential: anything that can read it can act as the user until
 * it expires. Keeping it in a module variable means a cross-site scripting bug
 * has to be running at the same moment to steal it, rather than being able to
 * read it out of storage at any point in the next seven days.
 *
 * The cost is that a page reload loses it, which is why the app calls
 * `refreshTokens()` on boot and trades the refresh token for a new one.
 */
let accessToken: string | null = null;

/** Called when the session is beyond saving, so the app can send the user to /login. */
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
    accessToken = token;
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
}

export function setRefreshToken(token: string | null): void {
    if (token === null) {
        localStorage.removeItem(REFRESH_STORAGE_KEY);
    } else {
        localStorage.setItem(REFRESH_STORAGE_KEY, token);
    }
}

export function setSessionLostHandler(handler: (() => void) | null): void {
    onSessionLost = handler;
}

export function clearTokens(): void {
    setAccessToken(null);
    setRefreshToken(null);
}

/** Mirrors the API's error envelope so screens can show the server's own message. */
export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: Record<string, string[]>;

    constructor(
        status: number,
        code: string,
        message: string,
        details?: Record<string, string[]>,
    ) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

async function toApiError(response: Response): Promise<ApiError> {
    let code = 'UNKNOWN';
    let message = `Request failed with status ${response.status}.`;
    let details: Record<string, string[]> | undefined;

    try {
        const body = await response.json();
        if (body?.error) {
            code = body.error.code ?? code;
            message = body.error.message ?? message;
            details = body.error.details;
        }
    } catch {
        // A non-JSON body (a proxy error page, say) leaves the defaults in place.
    }

    return new ApiError(response.status, code, message, details);
}

/**
 * In-flight refresh, shared by every caller.
 *
 * Without this, five requests failing with 401 at the same moment would each
 * start their own refresh. Because refresh tokens ROTATE — using one revokes it —
 * the first would succeed and the other four would present an already-revoked
 * token and fail, logging the user out for no reason. So everyone awaits the
 * same promise.
 */
let refreshPromise: Promise<boolean> | null = null;

export function refreshTokens(): Promise<boolean> {
    if (!refreshPromise) {
        refreshPromise = (async () => {
            const refreshToken = getRefreshToken();
            if (!refreshToken) return false;

            const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });

            if (!response.ok) {
                clearTokens();
                return false;
            }

            const data = (await response.json()) as AuthResponse;
            setAccessToken(data.accessToken);
            setRefreshToken(data.refreshToken);
            return true;
        })().finally(() => {
            refreshPromise = null;
        });
    }

    return refreshPromise;
}

type RequestOptions = {
    method?: string;
    body?: unknown;
    /** Internal: prevents an endless refresh loop. */
    isRetry?: boolean;
};

/** Low-level call that returns the raw Response — used by the CSV download. */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const response = await fetch(`${BASE_URL}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    // A 401 means the access token is missing or expired. Try exactly once to
    // refresh and replay the request; a second failure means the session is over.
    if (response.status === 401 && !options.isRetry) {
        const refreshed = await refreshTokens();

        if (refreshed) {
            return apiRequest(path, { ...options, isRetry: true });
        }

        clearTokens();
        onSessionLost?.();
    }

    return response;
}

/** The normal call: parses JSON, throws ApiError on failure. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await apiRequest(path, options);

    if (!response.ok) {
        throw await toApiError(response);
    }

    // 204 No Content — logout, for example — has no body to parse.
    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

/**
 * Downloads a file from an authenticated endpoint.
 *
 * A plain <a href> cannot be used here: the browser would follow it without an
 * Authorization header and get a 401. So the file is fetched like any other
 * request, turned into a blob, and handed to a temporary link that is clicked
 * programmatically and immediately discarded.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
    const response = await apiRequest(path);

    if (!response.ok) {
        throw await toApiError(response);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Releases the memory the blob was holding. Without this the file stays in
    // memory until the tab is closed.
    URL.revokeObjectURL(url);
}

/** Login is separate: it must not attach a token, and must not retry on 401. */
export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        throw await toApiError(response);
    }

    return (await response.json()) as AuthResponse;
}

export async function logoutRequest(): Promise<void> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return;

    try {
        await fetch(`${BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });
    } catch {
        // If the network call fails we still clear locally; the token expires anyway.
    }
}