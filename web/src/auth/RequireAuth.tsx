import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Route guard. This is a CONVENIENCE, not security — every protected endpoint
 * is enforced again on the server. Its job is to avoid showing a signed-out
 * user a page that would only fill with 401s.
 */
export function RequireAuth() {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center text-slate-500">
                Loading…
            </div>
        );
    }

    if (!user) {
        // `state` remembers where they were headed, so login can send them back.
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
}