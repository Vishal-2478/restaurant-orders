import { describe, expect, it } from 'vitest';
import { checkTransition, isEditable, isTerminal } from './orderStatus';

describe('checkTransition', () => {
    it('allows the happy path end to end', () => {
        expect(checkTransition('PLACED', 'ACCEPTED').ok).toBe(true);
        expect(checkTransition('ACCEPTED', 'PREPARING').ok).toBe(true);
        expect(checkTransition('PREPARING', 'READY').ok).toBe(true);
        expect(checkTransition('READY', 'SERVED').ok).toBe(true);
    });

    it('allows cancelling from Placed and Accepted', () => {
        expect(checkTransition('PLACED', 'CANCELLED').ok).toBe(true);
        expect(checkTransition('ACCEPTED', 'CANCELLED').ok).toBe(true);
    });

    it('refuses cancelling once the kitchen has started', () => {
        const result = checkTransition('PREPARING', 'CANCELLED');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toContain('only be cancelled while it is Placed or Accepted');
        }
    });

    it('refuses moving backwards', () => {
        const result = checkTransition('READY', 'PREPARING');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain('only valid next step is Served');
    });

    it('refuses skipping a step', () => {
        expect(checkTransition('PLACED', 'READY').ok).toBe(false);
    });

    it('refuses any change once served', () => {
        const result = checkTransition('SERVED', 'READY');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain('final');
    });

    it('refuses any change once cancelled', () => {
        expect(checkTransition('CANCELLED', 'PLACED').ok).toBe(false);
    });

    it('refuses a no-op transition', () => {
        const result = checkTransition('PREPARING', 'PREPARING');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('This order is already Preparing.');
    });
});

describe('isTerminal / isEditable', () => {
    it('marks Served and Cancelled as terminal', () => {
        expect(isTerminal('SERVED')).toBe(true);
        expect(isTerminal('CANCELLED')).toBe(true);
        expect(isTerminal('READY')).toBe(false);
    });

    it('allows editing lines only before Served or Cancelled', () => {
        expect(isEditable('PLACED')).toBe(true);
        expect(isEditable('READY')).toBe(true);
        expect(isEditable('SERVED')).toBe(false);
        expect(isEditable('CANCELLED')).toBe(false);
    });
});