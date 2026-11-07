/** Every string the tray menu editor writes, for an app to translate. `{name}` stands for the label of an item. */
export interface TrayMenuEditorLabels {
  readonly title: string;
  readonly detailLevel: string;
  readonly simple: string;
  readonly standard: string;
  readonly full: string;
  readonly custom: string;
  readonly items: string;
  readonly required: string;
  readonly show: string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly resetToDefault: string;
  readonly save: string;
  readonly preview: string;
  readonly previewEmpty: string;
  readonly separator: string;
  readonly levelBadge: string;
}

/** The English strings; an app overrides the ones it translates. */
export const DEFAULT_EDITOR_LABELS: TrayMenuEditorLabels = {
  title: "Tray menu",
  detailLevel: "Detail level",
  simple: "Simple",
  standard: "Standard",
  full: "Full",
  custom: "Custom",
  items: "Menu items",
  required: "Always shown",
  show: "Show {name}",
  moveUp: "Move {name} up",
  moveDown: "Move {name} down",
  resetToDefault: "Reset to default",
  save: "Save",
  preview: "Preview",
  previewEmpty: "The menu is empty",
  separator: "Separator",
  levelBadge: "From the {name} level"
};

/**
 * Puts the label of an item into a string that has a `{name}` in it.
 *
 * @param options - `template`: the string; `name`: the label to put in.
 * @returns The string.
 */
export function fillLabel({ template, name }: {
  readonly template: string;
  readonly name: string;
}) {
  return template.replace("{name}", name);
}
