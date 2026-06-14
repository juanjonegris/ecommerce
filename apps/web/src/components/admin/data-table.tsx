'use client';

import type { ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyState?: ReactNode;
  testid?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyState,
  testid,
}: DataTableProps<T>): React.ReactElement {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }
  return (
    <div className="rounded-md border" data-testid={testid ?? 'admin-data-table'}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} data-testid={`admin-row-${rowKey(row)}`}>
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
