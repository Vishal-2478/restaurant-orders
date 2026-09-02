import { describe, expect, it } from 'vitest';
import { canActOnOrder } from './orderPolicy';

const manager = { id: 'u-manager', role: 'MANAGER' as const };
const primary = { id: 'u-primary', role: 'WAITER' as const };
const collaborator = { id: 'u-collab', role: 'WAITER' as const };
const stranger = { id: 'u-stranger', role: 'WAITER' as const };

const order = {
    primaryWaiterId: 'u-primary',
    collaborators: [{ userId: 'u-collab' }],
};

describe('canActOnOrder', () => {
    it('lets a manager act on any order', () => {
        expect(canActOnOrder(manager, order)).toBe(true);
    });

    it('lets the primary waiter act on their own order', () => {
        expect(canActOnOrder(primary, order)).toBe(true);
    });

    it('lets a collaborator act on the order', () => {
        expect(canActOnOrder(collaborator, order)).toBe(true);
    });

    it('refuses an unrelated waiter', () => {
        expect(canActOnOrder(stranger, order)).toBe(false);
    });

    it('refuses an unrelated waiter when there are no collaborators', () => {
        expect(canActOnOrder(stranger, { primaryWaiterId: 'u-primary', collaborators: [] })).toBe(false);
    });
});