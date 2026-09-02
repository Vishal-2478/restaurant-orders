/**
 * Minimal RFC 4180 CSV writer.
 *
 * Written by hand rather than pulled in as a dependency: the whole of it is
 * the escaping rule below, and a library would be more code to audit than
 * this is to read.
 */

export type CsvColumn<T> = {
    key: keyof T & string;
    header: string;
};

/**
 * Spreadsheet formula injection: Excel and Google Sheets treat a cell
 * beginning with = + - or @ as a formula, so an order note reading
 * `=HYPERLINK("http://evil","click")` becomes a live link in the manager's
 * spreadsheet. Prefixing with an apostrophe forces it to stay text.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

function escapeCell(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    let text = value instanceof Date ? value.toISOString() : String(value);

    if (FORMULA_PREFIXES.includes(text[0] ?? '')) {
        text = `'${text}`;
    }

    // A field must be quoted if it contains a delimiter, a quote, or a newline.
    // Inside quotes, a literal quote is written twice.
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}

export function toCsv<T extends Record<string, unknown>>(
    rows: T[],
    columns: CsvColumn<T>[],
): string {
    const header = columns.map((column) => escapeCell(column.header)).join(',');
    const body = rows.map((row) =>
        columns.map((column) => escapeCell(row[column.key])).join(','),
    );

    // CRLF is what RFC 4180 specifies, and what Excel expects.
    return [header, ...body].join('\r\n');
}