import type { WheelWedge } from '@gameshow/schema';
import { wedgeLabel } from './wedge-label.js';

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 4;
const LABEL_RADIUS = RADIUS * 0.65;

function pointOnCircle(angleDegrees: number, radius: number) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(angleRadians),
    y: CENTER + radius * Math.sin(angleRadians),
  };
}

function describeSlice(startAngle: number, endAngle: number): string {
  const start = pointOnCircle(endAngle, RADIUS);
  const end = pointOnCircle(startAngle, RADIUS);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

/**
 * Pure presentational wheel graphic — takes already-resolved wedge data and
 * an optional index to highlight (the editor's static preview omits it; a
 * live board would pass the just-landed-on wedge). No spin animation or
 * action wiring here; that stays app-side.
 */
export function WheelGraphic({
  wedges,
  highlightedWedgeIndex,
}: {
  wedges: WheelWedge[];
  highlightedWedgeIndex?: number;
}) {
  if (wedges.length === 0) {
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Wheel with no wedges yet">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="currentColor" />
      </svg>
    );
  }

  const sliceAngle = 360 / wedges.length;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Wheel of Fortune wedges">
      {wedges.map((wedge, index) => {
        const startAngle = index * sliceAngle;
        const endAngle = startAngle + sliceAngle;
        const label = pointOnCircle(startAngle + sliceAngle / 2, LABEL_RADIUS);
        const isHighlighted = index === highlightedWedgeIndex;

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: wedges have no stable id, and shuffling replaces the whole list at once
          <g key={index}>
            <path
              d={describeSlice(startAngle, endAngle)}
              fill={isHighlighted ? 'currentColor' : 'none'}
              stroke="currentColor"
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={12}
            >
              {wedgeLabel(wedge)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
