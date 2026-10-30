/**
 * The change a control's text is shown with (`text-transform`), by control. The
 * renderer reads it where it writes a text to a control; the opt-in `compat`
 * group is the only writer, so a window that uses no `text-transform` carries
 * none of the transforms.
 */
export const textTransforms = new WeakMap<object, (text: string) => string>();
