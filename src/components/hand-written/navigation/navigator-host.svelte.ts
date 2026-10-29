import type { NavigationMode, StackChange } from "./navigation-stack.ts";
import { DEFAULT_CACHE_SIZE, NavigationCacheMode, NavigationStack } from "./navigation-stack.ts";
import type { StackEntry } from "./navigation-stack.ts";
import { mountControl } from "#src/renderer/host/mount.svelte.js";
import { flush } from "#src/scheduling.js";
import type { Component } from "svelte";

// What the Navigator adds to a ContentControl: pages that are Svelte
// components, a back and forward history (WinUI's Frame needs a page type
// registered in XAML, which a Node host cannot give it), and the control's own
// transitions playing when the content changes. A page is mounted into the
// control's Content as an items row is mounted into its slot; which pages stay
// mounted when the user leaves them is the cache mode's to say
// (navigation-stack.ts).

/** A page: a Svelte component whose props are the navigation's params. */
export type PageComponent = Component<never>;

/** A page, and how long it stays mounted after the user leaves it. */
export interface NavigationPage<Params extends object> {
  component: Component<Params>;
  cacheMode?: NavigationCacheMode;
}

/** A page as `navigate` takes it: the component alone (not cached), or with its cache mode. */
export type PageTarget<Params extends object> = Component<Params> | NavigationPage<Params>;

/** What `navigate` takes: the page, and its params when the page has props that need them. */
export type NavigateOptions<Params extends object> = {
  page: PageTarget<Params>;
} & (Record<string, never> extends Params ? { params?: Params } : { params: Params });

/** A page the history holds. */
export interface NavigationEntry {
  readonly page: PageComponent;
  readonly params: object;
  readonly cacheMode: NavigationCacheMode;
}

/** What `onNavigated` is told. */
export interface NavigatedEvent {
  readonly entry: NavigationEntry;
  readonly mode: NavigationMode;
}

/**
 * What app code does with the navigator (`bind:handle`). The reads are
 * reactive: an effect or a template that reads `canGoBack` follows it.
 */
export interface NavigatorHandle {
  // Goes to a page: its component, mounted with `params` as its props. The
  // pages that were forward of the current one are dropped.
  navigate<Params extends object>(options: NavigateOptions<Params>): void;
  // Goes back one page; does nothing when there is none.
  goBack(): void;
  // Goes forward one page; does nothing when there is none.
  goForward(): void;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  // The page being shown, or null before the first navigation.
  readonly current: NavigationEntry | null;
}

/** What the navigator reads from the component's props. */
export interface NavigatorHostProps {
  // How many enabled pages stay mounted: WinUI's Frame.CacheSize.
  cacheSize?: number | undefined;
  onNavigated?: ((event: NavigatedEvent) => void) | undefined;
}

/** Where a page is shown: a ContentControl, or anything with its Content. */
export interface PageSlot {
  content: unknown;
}

/** A mounted page: its root control, and how it ends. */
interface MountedPage {
  readonly root: unknown;
  unmount(): void;
}

interface PageEntry extends StackEntry, NavigationEntry {
  mount(): MountedPage;
}

interface StackView {
  readonly current: NavigationEntry | null;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

function isComponent<Params extends object>(target: PageTarget<Params>): target is Component<Params> {
  return typeof target === "function";
}

function pageOf<Params extends object>(target: PageTarget<Params>) {
  return isComponent(target) ? { component: target } : target;
}

// Generic here, so a page's params are checked against its props, and erased
// where the history holds them.
function entryOf<Params extends object>({ page, params }: {
  page: PageTarget<Params>;
  params: Params;
}) {
  const { component, cacheMode = NavigationCacheMode.DISABLED } = pageOf(page);
  return {
    page: component,
    params,
    cacheMode,
    mount: () => mountControl<Params>({
      component,
      props: params
    })
  } satisfies PageEntry;
}

class NavigatorHost implements NavigatorHandle {
  private readonly slot: PageSlot;
  private readonly props: NavigatorHostProps;
  private readonly stack: NavigationStack<PageEntry>;

  private readonly pages = new Map<PageEntry, MountedPage>();
  private view = $state.raw<StackView>({
    current: null,
    canGoBack: false,
    canGoForward: false
  });

  constructor({ slot, props }: {
    slot: PageSlot;
    props: NavigatorHostProps;
  }) {
    this.slot = slot;
    this.props = props;
    this.stack = new NavigationStack({ cacheSize: () => props.cacheSize ?? DEFAULT_CACHE_SIZE });
  }

  get canGoBack() {
    return this.view.canGoBack;
  }

  get canGoForward() {
    return this.view.canGoForward;
  }

  get current() {
    return this.view.current;
  }

  navigate<Params extends object>(options: NavigateOptions<Params>) {
    // A page that takes no params is given an empty object: the type of
    // `options` leaves `params` out only for a page whose props allow that.
    const params: Params = Object.assign({}, options.params);
    this.show(
      this.stack.navigate(
        entryOf({
          page: options.page,
          params
        })
      )
    );
  }

  goBack() {
    const change = this.stack.goBack();
    const isMoved = change !== null;
    if (isMoved) {
      this.show(change);
    }
  }

  goForward() {
    const change = this.stack.goForward();
    const isMoved = change !== null;
    if (isMoved) {
      this.show(change);
    }
  }

  // The new page goes into the control before the pages that end are unmounted:
  // a mounted page's root is left where the control has it, for the control to
  // drop.
  private show({ mode, to, released }: StackChange<PageEntry>) {
    const mounted = this.pages.get(to) ?? to.mount();
    this.pages.set(to, mounted);
    this.slot.content = mounted.root;
    for (const entry of released) {
      this.pages.get(entry)?.unmount();
      this.pages.delete(entry);
    }

    this.view = {
      current: to,
      canGoBack: this.stack.canGoBack,
      canGoForward: this.stack.canGoForward
    };
    flush();
    this.props.onNavigated?.({
      entry: to,
      mode
    });
  }

  dispose() {
    this.slot.content = null;
    for (const mounted of this.pages.values()) {
      mounted.unmount();
    }

    this.pages.clear();
  }
}

/**
 * Connects the control to the props: call it from the component's control
 * attachment.
 */
export function attachNavigator({ slot, props }: {
  slot: PageSlot;
  props: NavigatorHostProps;
}) {
  const host = new NavigatorHost({
    slot,
    props
  });
  return {
    handle: host,
    dispose() {
      host.dispose();
    }
  };
}
