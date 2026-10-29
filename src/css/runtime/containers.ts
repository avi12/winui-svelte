import type { Viewport } from "#src/css/parse/media.js";
import type { NativeValue } from "#src/native-value.js";

/** What finding and watching a container needs of WinUI: the seam's `read` and `subscribe`. */
export interface ContainerNative {
  read(input: {
    control: object;
    property: string;
  }): NativeValue;
  subscribe(control: object, event: string, handler: () => void): (() => void) | null;
}

const NAME_SEPARATOR = " ";
const ANY_NAME = "";
// The elements whose style makes them a container (`container-type`), with their names.
const containers = new WeakMap<object, string>();

function isObject(value: NativeValue): value is object {
  return typeof value === "object" && value !== null;
}

/** Makes `control` a container under these names (space separated; empty for none); returns what undoes it. */
export function registerContainer({ control, names }: {
  control: object;
  names: string;
}) {
  containers.set(control, names);
  return () => {
    containers.delete(control);
  };
}

function isNamed({ names, name }: {
  names: string;
  name: string;
}) {
  return name === ANY_NAME || names.split(NAME_SEPARATOR).includes(name);
}

/** The nearest ancestor of `control` that is a container with this name (any container for an empty name). */
export function containerOf({ control, name, native }: {
  control: object;
  name: string;
  native: ContainerNative;
}) {
  let ancestor = native.read({
    control,
    property: "parent"
  });
  while (isObject(ancestor)) {
    const names = containers.get(ancestor);
    const isMatch = names !== undefined && isNamed({
      names,
      name
    });
    if (isMatch) {
      return ancestor;
    }

    ancestor = native.read({
      control: ancestor,
      property: "parent"
    });
  }

  return null;
}

/** The size of a container in px, or null while it has none. */
export function sizeOfContainer({ container, native }: {
  container: object;
  native: ContainerNative;
}) {
  const width = native.read({
    control: container,
    property: "actualWidth"
  });
  const height = native.read({
    control: container,
    property: "actualHeight"
  });
  const isSized = typeof width === "number" && typeof height === "number";
  return isSized ? {
    width,
    height
  } satisfies Viewport : null;
}

interface Watched {
  container: object;
  unwatch: (() => void) | null;
}

/**
 * Follows the containers an element's `@container` rules ask about: the nearest
 * one by name, its size, and when it changes. An element not yet in the tree
 * has no container, so it asks again when it is loaded.
 */
export class ContainerWatch {
  private readonly control: object;
  private readonly native: ContainerNative;
  private readonly refresh: () => void;
  private readonly watched = new Map<string, Watched>();
  private unwatchLoaded: (() => void) | null = null;

  constructor({ control, native, refresh }: {
    control: object;
    native: ContainerNative;
    refresh: () => void;
  }) {
    this.control = control;
    this.native = native;
    this.refresh = refresh;
  }

  /** Watches the containers of exactly these names. */
  sync(names: ReadonlySet<string>) {
    for (const [name, entry] of this.watched) {
      const isWanted = names.has(name);
      if (!isWanted) {
        entry.unwatch?.();
        this.watched.delete(name);
      }
    }

    for (const name of names) {
      this.watch(name);
    }
  }

  /** The size of the container this name finds, or null. */
  sizeOf(name: string) {
    const entry = this.watched.get(name);
    return entry === undefined ? null : sizeOfContainer({
      container: entry.container,
      native: this.native
    });
  }

  /** Stops listening. */
  dispose() {
    this.sync(new Set());
    this.unwatchLoaded?.();
    this.unwatchLoaded = null;
  }

  private watch(name: string) {
    const container = containerOf({
      control: this.control,
      name,
      native: this.native
    });
    const known = this.watched.get(name);
    const isUnchanged = known?.container === container;
    if (isUnchanged) {
      return;
    }

    known?.unwatch?.();
    this.watched.delete(name);

    const isMissing = container === null;
    if (isMissing) {
      this.waitForTree();
      return;
    }

    this.watched.set(name, {
      container,
      unwatch: this.native.subscribe(container, "SizeChanged", this.refresh)
    });
  }

  private waitForTree() {
    const isWaiting = this.unwatchLoaded !== null;
    if (isWaiting) {
      return;
    }

    this.unwatchLoaded = this.native.subscribe(this.control, "Loaded", this.refresh);
  }
}
