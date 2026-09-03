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


export type MenuItem = {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    priceCents: number;
    isAvailable: boolean;
    archivedAt: string | null;
};

export type OrderLine = {
    id: string;
    orderId: string;
    menuItemId: string;
    menuItemName: string;
    unitPriceCents: number;
    quantity: number;
    specialInstructions: string | null;
    createdById: string;
    createdAt: string;
    voidedAt: string | null;
    voidReason: string | null;
    voidedById: string | null;
};

export type OrderEventType =
    | 'ORDER_CREATED'
    | 'STATUS_CHANGED'
    | 'LINE_ADDED'
    | 'LINE_VOIDED'
    | 'COLLABORATOR_ADDED'
    | 'COLLABORATOR_REMOVED'
    | 'NOTE_ADDED'
    | 'ORDER_ARCHIVED'
    | 'ORDER_RESTORED';

export type OrderEvent = {
    id: string;
    type: OrderEventType;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus | null;
    orderLineId: string | null;
    message: string | null;
    createdAt: string;
    actor: { id: string; name: string };
};

export type OrderCollaborator = {
    orderId: string;
    userId: string;
    addedById: string;
    addedAt: string;
    user: User;
};

export type OrderDetail = {
    id: string;
    tableNumber: number;
    status: OrderStatus;
    primaryWaiterId: string;
    placedAt: string;
    readyAt: string | null;
    servedAt: string | null;
    archivedAt: string | null;
    primaryWaiter: User;
    collaborators: OrderCollaborator[];
    lines: OrderLine[];
    events: OrderEvent[];
    totalCents: number;
};


export type BulkResultRow =
    | { id: string; status: 'updated'; name: string; priceCents: number; isAvailable: boolean }
    | { id: string; status: 'failed'; reason: string };

export type BulkResult = {
    results: BulkResultRow[];
    updated: number;
    failed: number;
};