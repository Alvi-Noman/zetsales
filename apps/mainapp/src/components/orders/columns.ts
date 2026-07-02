export type ColumnKey = 'customer' | 'product' | 'store' | 'total' | 'payment' | 'contact' | 'date';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
}

export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'product', label: 'Product' },
  { key: 'store', label: 'Store' },
  { key: 'total', label: 'Amount' },
  { key: 'payment', label: 'Payment' },
  { key: 'contact', label: 'Contact' },
  { key: 'date', label: 'Date' },
];

// Store is real, useful data for multi-store sellers, but not part of the default view — it's a
// toggle away via the Columns menu instead of always taking up a column.
export const DEFAULT_VISIBLE_COLUMNS: Set<ColumnKey> = new Set(COLUMN_DEFS.map((c) => c.key).filter((k) => k !== 'store'));
