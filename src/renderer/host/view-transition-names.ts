// The `view-transition-name` of each control that has one, kept by the CSS
// group that lowers the property (src/css/view-transition.ts) and read by
// `document.startViewTransition` (src/web-apis/view-transitions.ts), which
// pairs the controls named alike before and after an update.

const names = new Map<object, string>();

/**
 * Gives a control a view transition name.
 *
 * @param input - The control and its name.
 * @returns What takes the name away again.
 */
export function nameForTransition({ control, name }: {
  control: object;
  name: string;
}) {
  names.set(control, name);
  return () => {
    const isStillNamed = names.get(control) === name;
    if (isStillNamed) {
      names.delete(control);
    }
  };
}

/** Every control that has a view transition name, with its name. */
export function transitionNames() {
  return [...names];
}
