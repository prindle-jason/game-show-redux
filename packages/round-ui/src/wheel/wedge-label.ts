import type { WheelWedge } from '@gameshow/schema';

export function wedgeLabel(wedge: WheelWedge): string {
  switch (wedge.kind) {
    case 'cash':
      return `$${wedge.value}`;
    case 'bankrupt':
      return 'Bankrupt';
    case 'lose-turn':
      return 'Lose a turn';
  }
}
