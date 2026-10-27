import { read } from "./reflect.ts";
import type { NativeValue } from "#src/native-value.js";

// The element's native control, handed to code. Svelte runs an attachment in
// an effect of its own, so effects created inside the handler end with the
// attachment: when the element goes, when the expression is evaluated again,
// and when a hot update replaces the component.

type Cleanup = () => void;

/**
 * What an `@attach` directive takes. A custom renderer's element is not a DOM
 * element, so it is typed as the plain object it is.
 */
export type NodeAttachment = (node: object) => void | Cleanup;

// A <host> that holds no control (yet) has nothing to hand over.
function nativeControl(node: object) {
  return read(read(node, "native"), "control");
}

function isObject(value: NativeValue): value is object {
  return typeof value === "object" && value !== null;
}

// The tag fixes the class, so the control is the type the caller names for
// it; the renderer cannot check that from here.
function isTypedControl<Control extends object>(_value: object): _value is Control {
  return true;
}

/**
 * Hands an element's native control to code, typed by the caller:
 * `@attach control<ToggleSwitch>(toggle => { ...; return () => ... })`, written in braces.
 * The handler may return what undoes what it did. This is how a component
 * sets properties and subscribes to events: through the control's own typed
 * members, with no name mapped from text.
 *
 * @param handler - Runs once the element has a control of the class named by `Control`.
 * @returns The attachment to put after `@attach`.
 */
export function control<Control extends object>(handler: (control: Control) => void | Cleanup) {
  return (node: object) => {
    const native = nativeControl(node);
    const isControlMade = isObject(native) && isTypedControl<Control>(native);
    if (isControlMade) {
      return handler(native);
    }
  };
}

/**
 * Svelte hands a component the attachments written on it as symbol-keyed
 * props. A component spreads these onto its element, as web Svelte does, so
 * an `@attach` on `<TextBlock>` reaches the TextBlock's control.
 *
 * @param props - The component's props.
 * @returns The attachments among them.
 */
export function attachmentsOf(props: Partial<Record<symbol, NodeAttachment>>) {
  const attachments: Record<symbol, NodeAttachment> = {};
  for (const key of Object.getOwnPropertySymbols(props)) {
    const attachment = props[key];
    const isAttachment = attachment !== undefined;
    if (isAttachment) {
      attachments[key] = attachment;
    }
  }
  return attachments;
}

/**
 * Hands an element's control to code, checked against a class:
 * `@attach withControl({ type: StackPanel, use: panel => ... })`, in braces. It suits
 * code that wants the class verified (registering a panel for motion, reading
 * a text box). A control of another class is skipped.
 *
 * @param options - The class to check against, and what to do with a control of it.
 * @returns The attachment to put after `@attach`.
 */
export function withControl<Control>({ type, use }: {
  type: abstract new (...values: never[]) => Control;
  use: (control: Control) => void;
}) {
  return (node: object) => {
    const native = nativeControl(node);
    const isOfType = native instanceof type;
    if (isOfType) {
      use(native);
    }
  };
}
