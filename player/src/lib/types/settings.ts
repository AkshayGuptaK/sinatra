export type SettingCategory = "Appearance" | "AutoDJ";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export type SettingDefinition =
  | {
      id: string;
      category: SettingCategory;
      label: string;
      description: string;
      type: "select";
      options: SelectOption[];
      defaultValue: string;
    }
  | {
      id: string;
      category: SettingCategory;
      label: string;
      description: string;
      type: "boolean";
      defaultValue: boolean;
    };
