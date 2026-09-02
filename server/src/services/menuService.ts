import { prisma } from '../db';
import { notFound, conflict } from '../lib/errors';

export type MenuItemInput = {
    name: string;
    description?: string | null;
    category?: string | null;
    priceCents: number;
    isAvailable?: boolean;
};

export type ListMenuOptions = {
    /** Managers can ask to see archived items; the default menu hides them. */
    includeArchived?: boolean;
    /** Filter to items that can actually be ordered right now. */
    availableOnly?: boolean;
    /** Case-insensitive partial match on the item name. */
    search?: string;
    category?: string;
};

export async function listMenuItems(options: ListMenuOptions = {}) {
    const { includeArchived = false, availableOnly = false, search, category } = options;

    return prisma.menuItem.findMany({
        where: {
            ...(includeArchived ? {} : { archivedAt: null }),
            ...(availableOnly ? { isAvailable: true } : {}),
            ...(category ? { category } : {}),
            ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
}

export async function getMenuItem(id: string) {
    const item = await prisma.menuItem.findUnique({ where: { id } });

    if (!item) {
        throw notFound('Menu item not found.');
    }

    return item;
}

export async function createMenuItem(input: MenuItemInput) {
    return prisma.menuItem.create({
        data: {
            name: input.name,
            description: input.description ?? null,
            category: input.category ?? null,
            priceCents: input.priceCents,
            isAvailable: input.isAvailable ?? true,
        },
    });
}

export async function updateMenuItem(id: string, input: Partial<MenuItemInput>) {
    // Load first so a missing item is a 404 rather than a Prisma error, and so
    // the archived check below has something to look at.
    const existing = await getMenuItem(id);

    if (existing.archivedAt) {
        throw conflict('This menu item is archived. Restore it before editing it.');
    }

    return prisma.menuItem.update({
        where: { id },
        data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.category !== undefined ? { category: input.category } : {}),
            ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
            ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
        },
    });
}

/**
 * Archiving is a soft delete: the item leaves the menu but stays attached to
 * every order line that already references it, so old orders keep their names
 * and history stays readable.
 */
export async function archiveMenuItem(id: string) {
    const existing = await getMenuItem(id);

    if (existing.archivedAt) {
        throw conflict('This menu item is already archived.');
    }

    return prisma.menuItem.update({
        where: { id },
        data: { archivedAt: new Date() },
    });
}

export async function restoreMenuItem(id: string) {
    const existing = await getMenuItem(id);

    if (!existing.archivedAt) {
        throw conflict('This menu item is not archived.');
    }

    return prisma.menuItem.update({
        where: { id },
        data: { archivedAt: null },
    });
}