import { call } from "./reflect.ts";
import { DynWinRtMethodSig, DynWinRtType, DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import {
  ConnectedAnimationConfiguration
} from "#winui/microsoft/ui/xaml/media/animation/ConnectedAnimationConfiguration";

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

// The three configuration classes are not in the generated bindings, so each
// is activated by its class name through IActivationFactory.ActivateInstance
// (the slot after IInspectable's) and wrapped as the base class they share.
const CONFIGURATION_CLASSES = new Map<ConnectedAnimationKind, string>([
  [ConnectedAnimationKind.GRAVITY, "Microsoft.UI.Xaml.Media.Animation.GravityConnectedAnimationConfiguration"],
  [ConnectedAnimationKind.DIRECT, "Microsoft.UI.Xaml.Media.Animation.DirectConnectedAnimationConfiguration"],
  [ConnectedAnimationKind.BASIC, "Microsoft.UI.Xaml.Media.Animation.BasicConnectedAnimationConfiguration"]
]);
const ACTIVATION_FACTORY = "00000035-0000-0000-c000-000000000046";
const ACTIVATE_INSTANCE_SLOT = 6;
const FROM_NATIVE = "_fromNative";

/**
 * A new ConnectedAnimationConfiguration of the kind, to set as a connected
 * animation's `configuration` before it starts.
 *
 * @param kind - How the animation moves.
 * @returns The configuration.
 */
export function connectedConfiguration(kind: ConnectedAnimationKind) {
  const className = CONFIGURATION_CLASSES.get(kind);
  const isKnown = className !== undefined;
  if (!isKnown) {
    throw new RangeError(`${kind} is not a ConnectedAnimationKind`);
  }

  const factory = DynWinRtType.registerInterface("IActivationFactory", WinGuid.parse(ACTIVATION_FACTORY))
    .addMethod("ActivateInstance", new DynWinRtMethodSig().addOut(DynWinRtType.object()));
  const instance = factory.method(ACTIVATE_INSTANCE_SLOT).invoke(DynWinRtValue.activationFactory(className), []);
  // The generated class makes its wrapper from a native value in a static the types do not show.
  const wrapped = call(ConnectedAnimationConfiguration, FROM_NATIVE, instance);
  const isConfiguration = wrapped instanceof ConnectedAnimationConfiguration;
  if (!isConfiguration) {
    throw new TypeError(`${className} gave no ConnectedAnimationConfiguration`);
  }

  return wrapped;
}
