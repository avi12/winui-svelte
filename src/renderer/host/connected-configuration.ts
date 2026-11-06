import { projectAs } from "#src/winui.js";
import {
  BasicConnectedAnimationConfiguration
} from "#winui/microsoft/ui/xaml/media/animation/BasicConnectedAnimationConfiguration";
import {
  ConnectedAnimationConfiguration
} from "#winui/microsoft/ui/xaml/media/animation/ConnectedAnimationConfiguration";
import {
  DirectConnectedAnimationConfiguration
} from "#winui/microsoft/ui/xaml/media/animation/DirectConnectedAnimationConfiguration";
import {
  GravityConnectedAnimationConfiguration
} from "#winui/microsoft/ui/xaml/media/animation/GravityConnectedAnimationConfiguration";

/**
 * How a connected animation moves, as the ConnectedAnimationConfiguration
 * WinUI plays it with: `gravity` lifts the element and drops it with a shadow
 * (WinUI's default, made for going forward), `direct` flies it straight
 * across (made for going back), `basic` is the plain move with neither.
 */
export const ConnectedAnimationKind = {
  GRAVITY: "gravity",
  DIRECT: "direct",
  BASIC: "basic"
} as const;
/** One of the values of `ConnectedAnimationKind`. */
export type ConnectedAnimationKind = (typeof ConnectedAnimationKind)[keyof typeof ConnectedAnimationKind];

const CONFIGURATION_CLASSES = new Map([
  [ConnectedAnimationKind.GRAVITY, GravityConnectedAnimationConfiguration],
  [ConnectedAnimationKind.DIRECT, DirectConnectedAnimationConfiguration],
  [ConnectedAnimationKind.BASIC, BasicConnectedAnimationConfiguration]
]);

/**
 * A new ConnectedAnimationConfiguration of the kind, to set as a connected
 * animation's `configuration` before it starts.
 *
 * @param kind - How the animation moves.
 * @returns The configuration.
 */
export function connectedConfiguration(kind: ConnectedAnimationKind) {
  const configurationClass = CONFIGURATION_CLASSES.get(kind);
  if (!configurationClass) {
    throw new RangeError(`${kind} is not a ConnectedAnimationKind`);
  }

  return projectAs(new configurationClass(), ConnectedAnimationConfiguration);
}
