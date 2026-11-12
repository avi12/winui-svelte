import { z } from "zod";

const suggestedKeySchema = z.union([
  z.string(),
  z.object({
    default: z.string().optional(),
    windows: z.string().optional(),
    mac: z.string().optional(),
    linux: z.string().optional(),
    chromeos: z.string().optional(),
    android: z.string().optional(),
    ios: z.string().optional()
  })
]);

const commandDefinitionSchema = z.object({
  suggested_key: suggestedKeySchema.optional(),
  description: z.string().optional(),
  global: z.boolean().optional()
});

export const commandsSchema = z.record(z.string().min(1), commandDefinitionSchema);

/** One entry of the manifest's `commands` key; `suggested_key` is a string or one per platform. */
export type CommandDefinition = z.input<typeof commandDefinitionSchema>;

/** What `getAll` returns for one command. */
export interface Command {
  readonly name: string;
  readonly description: string;

  /** The shortcut as `"Ctrl+Shift+Y"`; empty when the command has none or Windows would not give it. */
  readonly shortcut: string;
}

/** A command whose shortcut could not be registered. */
export interface CommandFailure {
  readonly name: string;
  readonly error: Error;
}

/** The commands Chrome runs itself: `_execute_action` is a click on the action. */
export const EXECUTE_ACTION_COMMANDS: ReadonlySet<string> = new Set([
  "_execute_action",
  "_execute_browser_action",
  "_execute_page_action"
]);
