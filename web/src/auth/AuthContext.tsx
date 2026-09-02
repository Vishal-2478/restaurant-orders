import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    apiFetch,
    clearTokens,
    getRefreshToken,
    loginRequest,
    logoutRequest,
    refreshTokens,
    setAccessToken,
    setRefreshToken,
    setSessionLostHandler,
} from '../lib/api';
import type { User } from '../lib/types';

type AuthContextValue = {
    user: User | null;
    /** True until the boot-time session restore has finished. */
    isLoading: boolean;
    isManager: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    /**
     * On boot the access token is gone — it only ever lived in memory. If a
     * refresh token survived in localStorage, trade it for a new pair and reload
     * the user, so a page refresh does not look like being logged out.
     */
    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!getRefreshToken()) {
                if (!cancelled) setIsLoading(false);
                return;
            }

            const restored = await refreshTokens();

            if (restored) {
                try {
                    const me = await apiFetch<User>('/api/auth/me');
                    if (!cancelled) setUser(me);
                } catch {
                    clearTokens();
                }
            }

            if (!cancelled) setIsLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    // When the API layer gives up on the session, drop the user so the route
    // guard sends them to /login.
    useEffect(() => {
        setSessionLostHandler(() => setUser(null));
        return () => setSessionLostHandler(null);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const result = await loginRequest(email, password);
        setAccessToken(result.accessToken);
        setRefreshToken(result.refreshToken);
        setUser(result.user);
    }, []);

    const logout = useCallback(async () => {
        await logoutRequest();
        clearTokens();
        setUser(null);
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({ user, isLoading, isManager: user?.role === 'MANAGER', login, logout }),
        [user, isLoading, login, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used inside an AuthProvider.');
    }
    return context;
}