// Moving one key within an order, for the keyboard reorder (Alt+Up/Down).

/** Which way a key moves in its list's order: one place toward the start or toward the end. */
export const MoveDirection = {
  UP: -1,
  DOWN: 1
} as const;

/** A `MoveDirection` value. */
export type MoveDirection = (typeof MoveDirection)[keyof typeof MoveDirection];

/**
 * Where `key` lands when it moves one place; null when it is not in the
 * order or already at that end.
 */
export function movedIndex({ order, key, direction }: {
  order: readonly string[];
  key: string;
  direction: MoveDirection;
}) {
  const index = order.indexOf(key);
  const target = index + direction;
  const isMovable = index >= 0 && target >= 0 && target < order.length;
  return isMovable ? target : null;
}

/** Whether two orders hold the same keys in the same places. */
export function sameOrder({ first, second }: {
  first: readonly string[];
  second: readonly string[];
}) {
  return first.length === second.length && first.every((key, index) => key === second[index]);
}
