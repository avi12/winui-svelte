import { currentProgramCommand } from "./command.ts";
import type { ProgramCommand } from "./command.ts";
import { createWindowsRegistry } from "./native.ts";
import type { RegistryBackend } from "./registry.ts";

/** What the registrations of this folder take besides their own arguments. */
export interface RegistrationOptions {
  /** Stands in for the registry; the tests give one. */
  readonly registry?: RegistryBackend;

  /**
   * What Windows starts: this process's Node and entry script by default.
   * A bundled executable passes its own path.
   */
  readonly command?: ProgramCommand;
}

/**
 * The registry and command a registration uses, with the defaults filled in.
 *
 * @param options - What the caller gave.
 * @returns Both, always set.
 */
export function contextOf(options: RegistrationOptions) {
  return {
    registry: options.registry ?? createWindowsRegistry(),
    command: options.command ?? currentProgramCommand()
  };
}
