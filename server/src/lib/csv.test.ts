import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

const columns = [
    { key: 'name' as const, header: 'Name' },
    { key: 'note' as const, header: 'Note' },
];

describe('toCsv', () => {
    it('writes a header even with no rows', () => {
        expect(toCsv([], columns)).toBe('Name,Note');
    });

    it('joins rows with CRLF', () => {
        const csv = toCsv([{ name: 'A', note: 'x' }, { name: 'B', note: 'y' }], columns);
        expect(csv).toBe('Name,Note\r\nA,x\r\nB,y');
    });

    it('quotes fields containing a comma', () => {
        const csv = toCsv([{ name: 'Naan, garlic', note: '' }], columns);
        expect(csv).toBe('Name,Note\r\n"Naan, garlic",');
    });

    it('doubles embedded quotes', () => {
        const csv = toCsv([{ name: 'He said "hi"', note: '' }], columns);
        expect(csv).toBe('Name,Note\r\n"He said ""hi""",');
    });

    it('quotes fields containing a newline', () => {
        const csv = toCsv([{ name: 'two\nlines', note: '' }], columns);
        expect(csv).toBe('Name,Note\r\n"two\nlines",');
    });

    it('neutralises spreadsheet formulas', () => {
        const csv = toCsv([{ name: 'ok', note: '=HYPERLINK("http://evil")' }], columns);
        expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    });

    it('renders null and undefined as empty', () => {
        const csv = toCsv([{ name: null, note: undefined }], columns);
        expect(csv).toBe('Name,Note\r\n,');
    });

    it('renders dates as ISO strings', () => {
        const csv = toCsv([{ name: new Date('2026-09-02T10:00:00Z'), note: '' }], columns);
        expect(csv).toBe('Name,Note\r\n2026-09-02T10:00:00.000Z,');
    });
});