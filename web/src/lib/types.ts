export type Role = 'MANAGER' | 'WAITER';

export type OrderStatus =
    | 'PLACED'
    | 'ACCEPTED'
    | 'PREPARING'
    | 'READY'
    | 'SERVED'
    | 'CANCELLED';

export type User = {
    id: string;
    email: string;
    name: string;
    role: Role;
};

export type AuthResponse = {
    accessToken: string;
    refreshToken: string;
    user: User;
};


export type OrderListItem = {
    id: string;
    tableNumber: number;
    status: OrderStatus;
    primaryWaiterId: string;
    placedAt: string;
    readyAt: string | null;
    servedAt: string | null;
    archivedAt: string | null;
    primaryWaiter: { id: string; name: string };
    collaborators: { userId: string }[];
    lineCount: number;
    totalCents: number;
};

export type OrderListResponse = {
    orders: OrderListItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
};