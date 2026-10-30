import { ContainerWatch } from "./containers.ts";
import type { CssNative } from "./runtime.ts";
import { mediaMatches } from "#src/css/parse/media.js";
import type { MediaCondition, Viewport } from "#src/css/parse/media.js";
import type { Rule } from "#src/css/translate/types.js";

/**
 * What decides, for one element, whether a rule applies beyond its state: the
 * window's size (`@media`), a container's (`@container`) and whether the
 * element has loaded yet (`@starting-style`). It lives apart from the runtime
 * so a window whose sheets use none of these carries none of it.
 */
export class ElementQueries {
  private readonly control: object;
  private readonly native: CssNative;
  private readonly refresh: () => void;
  private viewport: Viewport | null = null;
  private unwatchViewport: (() => void) | null = null;
  private unwatchSettle: (() => void) | null = null;
  private containers: ContainerWatch | null = null;

  /** Whether the element has loaded, which ends the styling its `@starting-style` rules give. */
  isSettled = false;

  constructor({ control, native, refresh }: {
    control: object;
    native: CssNative;
    refresh: () => void;
  }) {
    this.control = control;
    this.native = native;
    this.refresh = refresh;
  }

  /** Listens to exactly what the candidate rules ask about. */
  sync(candidates: readonly Rule[]) {
    this.watchSettling(candidates.some(rule => rule.startingStyle === true));
    const queries = candidates.flatMap(rule => rule.media ?? []);
    this.syncViewport(queries.some(query => query.container === undefined));
    this.syncContainers(new Set(queries.flatMap(query => query.container ?? [])));
  }

  /** Whether the rule's query holds now. */
  isMediaActive(rule: Rule) {
    const { media } = rule;
    return media === undefined || mediaMatches({
      media,
      viewport: this.viewportFor(media)
    });
  }

  /** Stops listening. */
  dispose() {
    this.unwatchViewport?.();
    this.unwatchSettle?.();
    this.containers?.dispose();
  }

  // The @starting-style rules style the element until it is loaded: the second style
  // is a change of properties, which a `transition` animates. An element with no such
  // rule has nothing to settle.
  private watchSettling(hasStartingRules: boolean) {
    const isDone = this.isSettled || this.unwatchSettle !== null;
    if (isDone) {
      return;
    }

    if (!hasStartingRules) {
      this.isSettled = true;
      return;
    }

    const settle = () => {
      this.unwatchSettle?.();
      this.unwatchSettle = null;
      this.isSettled = true;
      this.refresh();
    };
    const isLoaded = this.native.read({
      control: this.control,
      property: "isLoaded"
    }) === true;
    this.unwatchSettle = this.native.subscribe(this.control, "Loaded", settle) ?? (() => undefined);

    if (isLoaded) {
      queueMicrotask(settle);
    }
  }

  // The size a query is about: the window's, or the nearest container's (of its name).
  private viewportFor(media: MediaCondition) {
    const { container } = media;
    return container === undefined ? this.viewport : this.containers?.sizeOf(container) ?? null;
  }

  // Listens to the containers the matching @container rules ask about.
  private syncContainers(names: ReadonlySet<string>) {
    const isUnneeded = names.size === 0 && this.containers === null;
    if (isUnneeded) {
      return;
    }

    this.containers ??= new ContainerWatch({
      control: this.control,
      native: this.native,
      refresh: this.refresh
    });
    this.containers.sync(names);
  }

  // Listens to the window's size exactly while some matching rule is under an @media.
  private syncViewport(isNeeded: boolean) {
    const isWatching = this.unwatchViewport !== null;
    if (!isNeeded) {
      this.unwatchViewport?.();
      this.unwatchViewport = null;
      this.viewport = null;
      return;
    }

    if (!isWatching) {
      this.unwatchViewport = this.native.watchViewport(this.control, () => {
        this.viewport = this.native.viewportOf(this.control);
        this.refresh();
      });
    }

    this.viewport = this.native.viewportOf(this.control);
  }
}
