import { commandsOfGeometry } from "./geometry-commands.ts";
import { lengthOfCommands } from "./path-geometry.ts";
import { sharedDevice } from "./resources.ts";

/**
 * The length of the outline of a Path's geometry, in pixels: what `draw` of
 * `svelte/transition` asks a path for.
 *
 * @throws {TypeError} when the control is not a Path
 */
export function pathControlLength(control: object) {
  const isPath = "data" in control;
  if (!isPath) {
    throw new TypeError("draw measures a Path, which holds a geometry in its Data");
  }

  return lengthOfCommands({
    creator: sharedDevice(),
    commands: commandsOfGeometry(control.data)
  });
}
