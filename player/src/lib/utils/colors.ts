export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return null;

  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;

  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Blends multiple hex colors by their numerical weights.
 * @param entries Array of { color: '#rrggbb', weight: number }
 * @param exponent Power factor to sharpen dominant emotions and prevent muddy grays (1 = linear, 2 = squared)
 */
export function blendHexColors(
  entries: { color: string; weight: number }[],
  exponent = 1
): string | null {
  let totalWeight = 0;
  let rAcc = 0;
  let gAcc = 0;
  let bAcc = 0;

  for (const { color, weight } of entries) {
    if (weight <= 0) continue;
    const rgb = hexToRgb(color);
    if (!rgb) continue;

    const w = exponent === 1 ? weight : Math.pow(weight, exponent);
    rAcc += rgb[0] * w;
    gAcc += rgb[1] * w;
    bAcc += rgb[2] * w;
    totalWeight += w;
  }

  if (totalWeight <= 0) return null;

  return rgbToHex([rAcc / totalWeight, gAcc / totalWeight, bAcc / totalWeight]);
}
