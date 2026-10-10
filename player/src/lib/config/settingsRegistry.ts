import type { SettingDefinition } from "$lib/types/settings";

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  // --- Appearance ---
  {
    id: "appearance.theme",
    category: "Appearance",
    label: "Color Theme",
    description:
      "Interface brightness mode (light, dark, or system preference)",
    type: "select",
    options: [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" },
      { value: "system", label: "System" },
    ],
    defaultValue: "dark",
  },
  {
    id: "appearance.skin",
    category: "Appearance",
    label: "Skin",
    description: "Aesthetic palette and styling tokens",
    type: "select",
    options: [
      { value: "resonance", label: "Resonance" },
      { value: "grayscale", label: "Neutral Grayscale" },
    ],
    defaultValue: "resonance",
  },
  {
    id: "appearance.tooltips",
    category: "Appearance",
    label: "Show Tooltips",
    description: "Display descriptive tooltips on control hover",
    type: "boolean",
    defaultValue: true,
  },

  // --- AutoDJ ---
  {
    id: "autodj.mode",
    category: "AutoDJ",
    label: "Recommendation Basis",
    description: "Metric for similarity recommendations",
    type: "select",
    options: [
      {
        value: "acoustics",
        label: "Acoustics",
        description: "Timbre & texture matching",
      },
      {
        value: "emotion",
        label: "Emotion",
        description: "Affective mood matching",
      },
    ],
    defaultValue: "acoustics",
  },
  {
    id: "autodj.batchSize",
    category: "AutoDJ",
    label: "Batch Size",
    description: "Number of tracks to queue per recommendation request",
    type: "select",
    options: [
      { value: "1", label: "1 track" },
      { value: "3", label: "3 tracks" },
      { value: "5", label: "5 tracks" },
    ],
    defaultValue: "3",
  },
];
