export function SolutionBoard({ rows }: { rows: string[] }) {
  return (
    <ul>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder/insert/delete
        <li key={index}>{row || ' '}</li>
      ))}
    </ul>
  );
}
