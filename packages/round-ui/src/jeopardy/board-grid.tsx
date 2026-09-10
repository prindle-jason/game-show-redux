import type { ReactNode } from 'react';

const headerCellClassName =
  'border border-border bg-surface-2 p-2 font-display text-sm text-strong';

/**
 * Layout-only grid shell shared by the live host/contestant boards and the
 * builder editor — behavior (click handling, revealed/active state, edit
 * affordances) is injected entirely via `renderCell`/`renderHeader`, never
 * baked in here, since the three consumers' interactions don't overlap.
 */
export function JeopardyBoardGrid({
  categoryNames,
  rowCount,
  renderCell,
  renderHeader,
}: {
  categoryNames: string[];
  rowCount: number;
  renderCell: (categoryIndex: number, clueIndex: number) => ReactNode;
  renderHeader?: (categoryIndex: number, name: string) => ReactNode;
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {categoryNames.map((name, categoryIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: category names may be blank/duplicate mid-edit; position is the only stable identity
            <th key={categoryIndex} className={headerCellClassName}>
              {renderHeader ? renderHeader(categoryIndex, name) : name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, clueIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond position
          <tr key={`row-${clueIndex}`}>
            {categoryNames.map((_, categoryIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cell identity is position, not content
              <td key={categoryIndex} className="border border-border bg-surface-1 p-2 text-center">
                {renderCell(categoryIndex, clueIndex)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
