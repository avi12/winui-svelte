// WinUI's VisualStateManager.VisualStateGroups is an attached collection that
// has a getter and no setter, which the renderer's attached properties (a
// setter each) cannot fill. This list stands in for the collection: the
// renderer places VisualStateGroups in it as it does in any vector, and the
// owner (state-group-owner.ts), which the renderer calls as it would an
// attached setter, binds it to the collection of the element it sits under.

/** The part of a native vector the list fills. */
export interface GroupCollection<Group> {
  append(group: Group): void;
  insertAt(position: number, group: Group): void;
  removeAt(position: number): void;
  indexOf(group: Group): unknown;
}

/**
 * The visual state groups an element holds, collected where the markup puts
 * them and copied to the element's own collection once it is known.
 */
export class StateGroupList<Group> {
  private readonly groups: Group[] = [];
  private collection: GroupCollection<Group> | null = null;

  /** Puts a group at a position, in the element's collection as well once bound. */
  insertAt(position: number, group: Group) {
    this.groups.splice(position, 0, group);
    this.collection?.insertAt(position, group);
  }

  /** Takes the group at a position out. */
  removeAt(position: number) {
    this.groups.splice(position, 1);
    this.collection?.removeAt(position);
  }

  /** The position of a group, or -1. */
  indexOf(group: Group) {
    return this.groups.indexOf(group);
  }

  /** Fills an element's collection with the groups. */
  bind(collection: GroupCollection<Group>) {
    this.release();
    this.collection = collection;
    for (const group of this.groups) {
      collection.append(group);
    }
  }

  /** Takes the list's groups out of the element's collection and lets it go. */
  release() {
    const { collection } = this;
    this.collection = null;
    const isBound = collection !== null;
    if (!isBound) {
      return;
    }

    for (const group of this.groups) {
      const position = Number(collection.indexOf(group));
      const isPlaced = position >= 0;
      if (isPlaced) {
        collection.removeAt(position);
      }
    }
  }
}
