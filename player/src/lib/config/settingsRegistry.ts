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

  // --- Playback ---
  {
    id: 'playback.fade',
    category: 'Playback',
    label: 'Fade',
    description: 'Gently ramp volume when starting, pausing, or seeking',
    type: 'boolean',
    defaultValue: true
  },
  {
    id: 'playback.transition',
    category: 'Playback',
    label: 'Transition',
    description: 'Transition behavior between consecutive tracks in the queue',
    type: 'select',
    options: [
      {
        value: 'off',
        label: 'Off',
        description: 'Standard playback'
      },
      {
        value: 'crossfade_3s',
        label: 'Crossfade (3s)',
        description: '3-second overlap blend'
      },
      {
        value: 'crossfade_5s',
        label: 'Crossfade (5s)',
        description: '5-second overlap blend'
      },
      {
        value: 'gapless',
        label: 'Gapless',
        description: 'Skip all silence'
      },

    ],
    defaultValue: 'off'
  },
  {
    id: 'playback.normalization',
    category: 'Playback',
    label: 'Volume Normalization',
    description: 'Real-time dynamic leveling to smooth extreme volume spikes and dips',
    type: 'boolean',
    defaultValue: false
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
    id: 'autodj.referenceTrack',
    category: 'AutoDJ',
    label: 'Recommendation Anchor',
    description: 'Whether recommendations evolve from the end of the queue or anchor to the start',
    type: 'select',
    options: [
      {
        value: 'last',
        label: 'Last Track',
        description: 'Evolving journey'
      },
      {
        value: 'first',
        label: 'First Track',
        description: 'Station anchor'
      }
    ],
    defaultValue: 'last'
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

  // --- Visualizer ---
  {
    id: "visualizer.style",
    category: "Visualizer",
    label: "Fluid Style",
    description: "Physical fluid simulation medium and boundary dynamics",
    type: "select",
    options: [
      {
        value: "smoke",
        label: "Smoke",
        description: "Atmospheric, wispy vapor with curling tendrils",
      },
      {
        value: "water",
        label: "Water",
        description: "Rolling fluid with cohesive momentum transfer",
      },
      {
        value: "oil",
        label: "Oil",
        description: "Heavy, viscous marbling with surface tension",
      },
    ],
    defaultValue: "smoke",
  },
  {
    id: "visualizer.performance",
    category: "Visualizer",
    label: "Performance Quality",
    description: "Particle density, resolution, and simulation fidelity",
    type: "select",
    options: [
      {
        value: "battery",
        label: "Battery Saver (30 FPS)",
        description: "Low power: 6.4k particles, half resolution",
      },
      {
        value: "balanced",
        label: "Balanced (60 FPS)",
        description: "Balanced: 16k particles, standard resolution",
      },
      {
        value: "high",
        label: "High Quality (60 FPS)",
        description: "High fidelity: 25.6k particles, high resolution",
      },
      {
        value: "ultra",
        label: "Ultra Quality (Native FPS)",
        description: "Uncapped refresh rate: 40k particles, max DPR",
      },
    ],
    defaultValue: "balanced",
  },
];
