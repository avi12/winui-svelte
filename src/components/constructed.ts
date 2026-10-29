import { projectAs, PropertyPath, TargetPropertyPath, XamlReader } from "./generated/bindings.ts";
import type { UIElement } from "./generated/bindings.ts";

// Classes WinUI only accepts made ready: a VisualState or a VisualStateGroup
// is named only when XAML makes it (their Name has no setter, and
// `VisualStateManager.GoToState` looks the state up by that name), and a
// Setter is refused by the collection of a visual state until it has its
// target. The component of such a class (tables.ts, constructedClasses) reads
// these props once, when the control is made, and a helper here makes it.

const PRESENTATION_NAMESPACE = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
const XAML_NAMESPACE = "http://schemas.microsoft.com/winfx/2006/xaml";
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/** The prop a class WinUI can only name through XAML takes. */
export interface NamedProps {
  /** The name `VisualStateManager.GoToState` finds it by; read once, when the control is made. */
  name: string;
}

/** The props a visual state's setter needs before the state can hold it. */
export interface SetterTargetProps {
  /** The element the setter changes while its state is active; read once, when the control is made. */
  target: UIElement;
  /** The property of `target` it changes, as XAML writes it (`Opacity`, `(Grid.Row)`); read once. */
  path: string;
}

/**
 * A constructor the renderer calls like the class's own, which makes the
 * object through XAML so that it carries `name`.
 *
 * @throws {Error} When `name` is not an identifier XAML accepts.
 */
export function namedByXaml<Made extends object>({ type, xamlName, name }: {
  type: { readonly prototype: Made };
  xamlName: string;
  name: string;
}) {
  const isIdentifier = IDENTIFIER.test(name);
  if (!isIdentifier) {
    throw new Error(`${JSON.stringify(name)} is not a name XAML accepts for a ${xamlName}`);
  }

  const markup = `<${xamlName} xmlns="${PRESENTATION_NAMESPACE}" xmlns:x="${XAML_NAMESPACE}" x:Name="${name}"/>`;
  // A function, not a class: `new` on it gives the object it returns.
  return function made() {
    return projectAs(XamlReader.load(markup), type);
  };
}

/** A constructor for a setter that has its target path from the start. */
export function setterAt<Made extends { target: TargetPropertyPath }>({ type, target, path }: {
  type: new () => Made;
  target: UIElement;
  path: string;
}) {
  return function made() {
    const setter = new type();
    const targetPath = new TargetPropertyPath();
    targetPath.target = target;
    targetPath.path = new PropertyPath(path);
    setter.target = targetPath;
    return setter;
  };
}
