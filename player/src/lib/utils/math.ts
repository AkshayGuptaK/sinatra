export interface Point2D {
  x: number;
  y: number;
}

/**
 * Finds the nearest item to a given world coordinate within a maximum threshold distance.
 * Returns null if no point is within range.
 */
export function findNearestPoint<T>(
  items: T[],
  target: Point2D,
  getCoords: (item: T) => Point2D | null | undefined,
  maxRadius: number
): T | null {
  const maxRadiusSq = maxRadius * maxRadius;

  return (
    items
      .map((item) => {
        const coords = getCoords(item);
        if (!coords) return null;
        const dx = coords.x - target.x;
        const dy = coords.y - target.y;
        return { item, distSq: dx * dx + dy * dy };
      })
      .filter(
        (entry): entry is { item: T; distSq: number } =>
          entry !== null && entry.distSq <= maxRadiusSq
      )
      .reduce<{ item: T; distSq: number } | null>(
        (closest, curr) =>
          !closest || curr.distSq < closest.distSq ? curr : closest,
        null
      )?.item ?? null
  );
}
