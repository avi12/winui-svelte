import type { ToggleSwitchComponentProps } from "#src/components/index.js";
import { projectAs } from "#src/winui.js";
import { RoutedEventArgs } from "#winui/microsoft/ui/xaml/RoutedEventArgs";

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

// The handler gets the control that raised the event, typed as its class, and
// the event's arguments as the bare object WinUI hands over, which names the
// class projectAs reads it as.
export const typedArguments: ToggleSwitchComponentProps = {
  ontoggled(sender, args) {
    const isOn: boolean = sender.isOn;
    const source: unknown = projectAs(args, RoutedEventArgs).originalSource;
    return [isOn, source];
  }
};

export const wrongArguments: ToggleSwitchComponentProps = {
  ontoggled(sender) {
    // @ts-expect-error a ToggleSwitch has no such member
    return sender.isToggled;
  }
};
