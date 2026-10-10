import { SETTINGS_DEFINITIONS } from "$lib/config/settingsRegistry";

export interface CommandSuggestionItem {
  prefix: string;
  label: string;
  desc: string;
}

export function getSettingSuggestions(input: string): CommandSuggestionItem[] {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/set")) return [];

  const parts = trimmed.split(/\s+/);
  // Case 1: Typing "/set" or partial "/set app"
  if (parts.length <= 2) {
    const keyPrefix = parts[1] ?? "";
    return SETTINGS_DEFINITIONS.filter((def) =>
      def.id.toLowerCase().startsWith(keyPrefix.toLowerCase())
    ).map((def) => ({
      prefix: `/set ${def.id}`,
      label: `/set ${def.id}`,
      desc: `[${def.category}] ${def.label} — ${def.description}`,
    }));
  }

  // Case 2: Key is complete, typing the value: "/set appearance.skin res"
  const targetKey = parts[1];
  const valuePrefix = parts.slice(2).join(" ").toLowerCase();
  const def = SETTINGS_DEFINITIONS.find((d) => d.id === targetKey);

  if (!def) return [];

  if (def.type === "boolean") {
    const boolOptions = [
      { val: "on", desc: "Enable" },
      { val: "off", desc: "Disable" },
    ];
    return boolOptions
      .filter((o) => o.val.startsWith(valuePrefix))
      .map((o) => ({
        prefix: `/set ${def.id} ${o.val}`,
        label: `/set ${def.id} ${o.val}`,
        desc: o.desc,
      }));
  }

  return def.options
    .filter(
      (opt) =>
        opt.value.toLowerCase().startsWith(valuePrefix) ||
        opt.label.toLowerCase().startsWith(valuePrefix)
    )
    .map((opt) => ({
      prefix: `/set ${def.id} ${opt.value}`,
      label: `/set ${def.id} ${opt.value}`,
      desc: opt.description ?? opt.label,
    }));
}
