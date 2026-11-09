import { hasPackageIdentity } from "#src/window/package-identity.js";

// A Win2D class that a packaged process cannot activate is almost always the
// manifest's doing, and the error says only which class, once per class:
// this words it once for the process, naming the fix.

const NOT_REGISTERED = "0x80040154";
const WIN2D_CLASS = "Microsoft.Graphics.Canvas.";
const PACKAGED_HINT = "Win2D is not registered in this package: add win2dActivatableClasses() of winui-svelte/win2d/manifest to the package's <Extensions> in AppxManifest.xml, with Microsoft.Graphics.Canvas.dll in the package (API.md, Win2D, Packaged apps)";

let isHinted = false;

/**
 * What to write for a failure of a Win2D effect or drawing: in a packaged
 * process, a Win2D class that is not registered is one message that names the
 * manifest fragment, written once; anything else is the error's own message.
 *
 * @param error - What was thrown.
 * @returns The line to write, or null when it was already written.
 */
export function win2dFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const isUnregistered = message.includes(NOT_REGISTERED) && message.includes(WIN2D_CLASS);
  const isPackagedUnregistered = isUnregistered && hasPackageIdentity();
  if (!isPackagedUnregistered) {
    return message;
  }

  if (isHinted) {
    return null;
  }

  isHinted = true;
  return PACKAGED_HINT;
}
