import { cn, surfaceControlStyles } from '@gameshow/ui';

const ROW_LENGTH = 14;

/**
 * Fixed 14-cell grid per row — matches the physical Wheel-of-Fortune board's
 * constant size, so every puzzle occupies the same footprint regardless of
 * how short its rows are. A row shorter than 14 characters is centered among
 * blank cells; a row longer than 14 is cropped to the first 14 — puzzle
 * authoring is expected to respect the fixed row length, same as the
 * physical board would. `' '` (a word gap, plus any padding outside the row)
 * renders as a plain blank cell. `'_'` (an unguessed letter, per
 * `maskSolution` in party's wheel-of-fortune round) renders as `_` on a
 * highlighted tile; any other character renders uppercased on the same
 * highlighted tile — the highlight marks "a letter goes here" regardless of
 * whether it's been guessed yet.
 */
export function SolutionBoard({ rows }: { rows: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row, index) => {
        const offset = Math.max(0, Math.floor((ROW_LENGTH - row.length) / 2));
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder/insert/delete
            key={index}
            aria-label={row}
            className="flex gap-1"
          >
            {Array.from({ length: ROW_LENGTH }, (_, cellIndex) => row[cellIndex - offset]).map(
              (char, cellIndex) => {
                const isGap = char === undefined || char === ' ';
                const isLetterCell = !isGap;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: cell identity is position, not content
                    key={cellIndex}
                    aria-hidden="true"
                    className={cn(
                      surfaceControlStyles,
                      'flex h-6 w-6 items-center justify-center font-display text-xs sm:h-8 sm:w-8 sm:text-base',
                      isLetterCell && 'bg-secondary',
                    )}
                  >
                    {isGap ? ' ' : char === '_' ? '_' : char.toUpperCase()}
                  </span>
                );
              },
            )}
          </li>
        );
      })}
    </ul>
  );
}
