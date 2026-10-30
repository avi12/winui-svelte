import type { CssNative } from "./runtime.ts";
import type { MediaChange, MediaInputs, MediaStore } from "#src/css/media/features.js";
import type { ParsedMedia } from "#src/css/media/query.js";
import { changesOf, mediaListMatches, parseMediaList } from "#src/css/media/query.js";
import type { NativeValue } from "#src/native-value.js";

// The window-bound changes reach the element through its XamlRoot (the
// viewport watcher of queries.ts), so the store is not asked for them.
const ROOT_CHANGES: ReadonlySet<MediaChange> = new Set(["viewport", "scale"]);
const ELEMENT_THEME_DARK = 2;

function isRecord(value: NativeValue): value is Record<string, NativeValue> {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

/**
 * What decides, for one element, the `@media` terms beyond the window's size
 * (preferences, display, input): the one media query evaluator, over the
 * store's answers, with the element's own theme, scale and size over them. It
 * lives apart from the queries so a window whose sheets ask none carries none
 * of it.
 */
export class ElementEnvironment {
  private readonly control: object;
  private readonly native: CssNative;
  private readonly store: MediaStore;
  private readonly refresh: () => void;
  private readonly parsedByText = new Map<string, ParsedMedia>();
  private viewport: () => {
    width: number;
    height: number;
  } | null;
  private stopStore: (() => void) | null = null;
  private stopTheme: (() => void) | null = null;
  private watched = "";

  constructor({ control, native, store, refresh, viewport }: {
    control: object;
    native: CssNative;
    store: MediaStore;
    refresh: () => void;
    viewport: () => {
      width: number;
      height: number;
    } | null;
  }) {
    this.control = control;
    this.native = native;
    this.store = store;
    this.refresh = refresh;
    this.viewport = viewport;
  }

  /** Whether the query holds for this element now. */
  matches(query: string) {
    return mediaListMatches({
      parsed: this.parse(query),
      inputs: this.inputs()
    });
  }

  /** Listens to exactly what the queries of the matching rules ask about. */
  sync(queries: ReadonlySet<string>) {
    const key = [...queries].sort().join("\n");
    const isUnchanged = key === this.watched;
    if (isUnchanged) {
      return;
    }

    this.watched = key;
    this.stopListening();
    const changes = new Set<MediaChange>();
    for (const query of queries) {
      for (const change of changesOf(this.parse(query))) {
        const isForStore = !ROOT_CHANGES.has(change);
        if (isForStore) {
          changes.add(change);
        }
      }
    }

    const isWatching = queries.size > 0;
    if (!isWatching) {
      return;
    }

    this.stopTheme = this.native.subscribe(this.control, "ActualThemeChanged", this.refresh);
    const isStoreNeeded = changes.size > 0;
    if (isStoreNeeded) {
      this.stopStore = this.store.subscribe({
        changes,
        callback: this.refresh
      });
    }
  }

  /** Stops listening. */
  dispose() {
    this.stopListening();
    this.watched = "";
  }

  private stopListening() {
    this.stopStore?.();
    this.stopTheme?.();
    this.stopStore = null;
    this.stopTheme = null;
  }

  private parse(query: string) {
    const cached = this.parsedByText.get(query);
    const isCached = cached !== undefined;
    if (isCached) {
      return cached;
    }

    const parsed = parseMediaList(query);
    this.parsedByText.set(query, parsed);
    return parsed;
  }

  // The store's answers, with this element's own where it has them.
  private inputs() {
    const { inputs } = this.store;
    return {
      ...inputs,
      viewport: () => this.viewport() ?? inputs.viewport(),
      isDark: () => {
        const theme = this.native.read({
          control: this.control,
          property: "actualTheme"
        });
        const isThemeKnown = typeof theme === "number";
        return isThemeKnown ? theme === ELEMENT_THEME_DARK : inputs.isDark();
      },
      scale: () => {
        const root = this.native.read({
          control: this.control,
          property: "xamlRoot"
        });
        const scale = isRecord(root) ? root["rasterizationScale"] : undefined;
        return typeof scale === "number" ? scale : inputs.scale();
      }
    } satisfies MediaInputs;
  }
}
