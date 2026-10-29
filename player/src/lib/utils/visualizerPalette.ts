import { COWEN_EMOTION_COLORS } from "$lib/constants/emotions";
import { AROUSAL_CONFIG } from "$lib/config/visualizer";

export interface ActiveEmotionColor {
  name: string;
  colorHex: string;
  rgb: [number, number, number];
  weight: number; // Normalized proportion [0.0 - 1.0], sum = 1.0
}

export interface SegmentAffectiveProfile {
  colors: ActiveEmotionColor[];
  arousalScore: number; // 0.0 (deep calm) to 1.0 (hyper intense)
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return [
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255,
  ];
}

export function extractSegmentProfile(
  emotions: Record<string, number> | null | undefined,
  threshold = 0.3
): SegmentAffectiveProfile {
  if (!emotions) {
    return {
      colors: [
        {
          name: "calm",
          colorHex: "#10b981",
          rgb: [0.06, 0.72, 0.5],
          weight: 1.0,
        },
      ],
      arousalScore: 0.2,
    };
  }

  // 1. Filter strictly to the 13 core emotions with valid colors
  const coreEntries = Object.entries(emotions).filter(
    ([name]) => name in COWEN_EMOTION_COLORS
  );

  // 2. Select all emotions crossing the threshold
  let qualified = coreEntries.filter(([_, score]) => score >= threshold);

  // Fallback: If none pass threshold, select the single highest among core 13
  if (qualified.length === 0 && coreEntries.length > 0) {
    const highest = coreEntries.reduce((best, curr) =>
      curr[1] > best[1] ? curr : best
    );
    qualified = [highest];
  }

  // 3. Compute proportional distribution (weights sum to 1.0)
  const totalScore =
    qualified.reduce((sum, [_, score]) => sum + score, 0) || 1.0;
  const colors: ActiveEmotionColor[] = qualified.map(([name, score]) => ({
    name,
    colorHex: COWEN_EMOTION_COLORS[name],
    rgb: hexToRgb(COWEN_EMOTION_COLORS[name]),
    weight: score / totalScore,
  }));

  // 4. Compute arousal score from user-configured sets
  let highSum = 0;
  let lowSum = 0;
  for (const [name, score] of coreEntries) {
    if (AROUSAL_CONFIG.highArousalEmotions.has(name)) highSum += score;
    if (AROUSAL_CONFIG.lowArousalEmotions.has(name)) lowSum += score;
  }
  const arousalScore = Math.max(0, Math.min(1, (highSum - lowSum + 1.0) / 2.0));

  return { colors, arousalScore };
}
