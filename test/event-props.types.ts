import type { ToggleSwitchComponentProps } from "#src/components/index.js";

// Never run: `pnpm check` (tsc) reads it. An event prop is the WinUI event
// name in lowercase, like the DOM's, so the camel-case spelling is an unknown
// prop under an `@ts-expect-error` that fails the check if it were accepted.
export const accepted: ToggleSwitchComponentProps = {
  ontoggled: () => undefined
};

export const refused: ToggleSwitchComponentProps = {
  // @ts-expect-error WinUI's own case is no event prop: it is ontoggled
  onToggled: () => undefined
};
