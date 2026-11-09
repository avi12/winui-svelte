// While the renderer changes a control's items or children, the control raises
// the events a user's change would (a ComboBox loses its selection when the
// item it shows is taken out and put back): those are the renderer's own, and
// no component may take them for the user's.

let depth = 0;

/**
 * Runs `action`, a change of a control's items or children by the renderer.
 *
 * @param action - What changes the control's structure.
 */
export function duringStructureSync(action: () => void) {
  depth++;
  try {
    action();
  } finally {
    depth--;
  }
}

/** Whether the renderer is changing a control's items or children now. */
export function isStructureSyncing() {
  return depth > 0;
}
