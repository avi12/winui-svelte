import {
  defaultBadgeColor,
  setBadgeColorSchema,
  setBadgeTextSchema,
  setIconSchema,
  setTitleSchema,
  tabDetailsSchema
} from "./action-types.ts";
import type {
  ColorArray,
  SetBadgeColorDetails,
  SetBadgeTextDetails,
  SetIconDetails,
  SetTitleDetails,
  TabDetails
} from "./action-types.ts";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { TrayIconImage } from "#src/tray/tray-core.js";

// The most a tray tooltip holds: NOTIFYICONDATA's szTip is 128 UTF-16 units
// with the terminator.
const TOOLTIP_LIMIT = 127;
const ELLIPSIS = "…";

/** The part of a tray icon that `ChromeAction` drives: `createTrayIcon`'s handle and the standalone tray's both fit. */
export interface ActionTray {
  update(changes: {
    readonly icon?: TrayIconImage | undefined;
    readonly tooltip?: string | undefined;
  }): void;
}

/** What `ChromeAction` takes. */
export interface ChromeActionOptions {
  /** The title (the tray tooltip) to start with. */
  readonly title?: string | undefined;

  /** The tray to drive; `attach` gives it later, once it exists. */
  readonly tray?: ActionTray | undefined;
}

function tooltipOf({ title, badge }: {
  title: string;
  badge: string;
}) {
  const text = badge === "" ? title : `${title} (${badge})`;
  const isTooLong = text.length > TOOLTIP_LIMIT;
  return isTooLong ? text.slice(0, TOOLTIP_LIMIT - 1) + ELLIPSIS : text;
}

/**
 * `chrome.action` for a Windows app, over the tray icon. The title is the
 * tooltip and `setIcon` swaps the icon file. The tray cannot draw on its icon,
 * so the badge text is a suffix of the tooltip, `"Inbox (3)"`, and the badge
 * color is kept for `getBadgeBackgroundColor` and nothing more. A disabled
 * action still shows, but a click on it is ignored (the tray cannot grey an
 * icon). There are no tabs, so `tabId` is accepted and ignored: everything
 * is global.
 *
 * Wire the tray's `onclick` to `click()`, then `attach` the tray, or let
 * `createChromeAction` do both.
 */
export class ChromeAction {
  /** Fires on a click on the tray icon while the action is enabled. */
  readonly onClicked = new ChromeEvent<() => void>();
  private tray: ActionTray | undefined;
  private title: string;
  private badgeText = "";
  private badgeColor: ColorArray = defaultBadgeColor();
  private isActionEnabled = true;

  /** Made once per tray icon. */
  constructor(options: ChromeActionOptions = {}) {
    this.title = options.title ?? "";

    const { tray } = options;
    const hasTray = tray !== undefined;
    if (hasTray) {
      this.attach(tray);
    }
  }

  /**
   * Drives `tray` from now on, and pushes the title and badge it holds.
   *
   * @param tray - The tray icon.
   */
  attach(tray: ActionTray) {
    this.tray = tray;
    this.showTooltip();
  }

  /** Reports a click on the icon; give it to the tray's `onclick`. A disabled action ignores it. */
  click() {
    if (this.isActionEnabled) {
      this.onClicked.dispatch();
    }
  }

  /**
   * Sets the tooltip's text.
   *
   * @param details - The title.
   * @throws ZodError When `details` is not `{ title }`.
   */
  setTitle(details: SetTitleDetails) {
    return Promise.try(() => {
      this.title = setTitleSchema.parse(details).title;
      this.showTooltip();
    });
  }

  /**
   * The title.
   *
   * @param details - Ignored: there are no tabs.
   * @returns The title that was set.
   */
  getTitle(details: TabDetails = {}) {
    return Promise.try(() => {
      tabDetailsSchema.parse(details);
      return this.title;
    });
  }

  /**
   * Swaps the icon file.
   *
   * @param details - `{ path }`: an icon path, or `{ forLightTaskbar, forDarkTaskbar }`.
   * @throws ZodError When `details` has no `path`, as it does for Chrome's `imageData`.
   */
  setIcon(details: SetIconDetails) {
    return Promise.try(() => {
      const { path } = setIconSchema.parse(details);
      this.tray?.update({ icon: path });
    });
  }

  /**
   * Sets the badge as a tooltip suffix; empty text, or none, clears it.
   *
   * @param details - `{ text }`.
   */
  setBadgeText(details: SetBadgeTextDetails) {
    return Promise.try(() => {
      this.badgeText = setBadgeTextSchema.parse(details).text ?? "";
      this.showTooltip();
    });
  }

  /**
   * The badge text.
   *
   * @param details - Ignored: there are no tabs.
   * @returns The text that was set, empty for none.
   */
  getBadgeText(details: TabDetails = {}) {
    return Promise.try(() => {
      tabDetailsSchema.parse(details);
      return this.badgeText;
    });
  }

  /**
   * Keeps a badge color. It is not drawn: the tray cannot paint on an icon.
   *
   * @param details - `{ color }`: four channels, or `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`.
   * @throws ZodError When the color is neither.
   */
  setBadgeBackgroundColor(details: SetBadgeColorDetails) {
    return Promise.try(() => {
      this.badgeColor = setBadgeColorSchema.parse(details).color;
    });
  }

  /**
   * The badge color.
   *
   * @param details - Ignored: there are no tabs.
   * @returns Red, green, blue and alpha; Chrome's red until one is set.
   */
  getBadgeBackgroundColor(details: TabDetails = {}) {
    return Promise.try(() => {
      tabDetailsSchema.parse(details);
      return structuredClone(this.badgeColor);
    });
  }

  /**
   * Lets clicks through again.
   *
   * @param tabId - Ignored: there are no tabs.
   */
  enable(tabId?: number) {
    return Promise.try(() => {
      tabDetailsSchema.parse({ tabId });
      this.isActionEnabled = true;
    });
  }

  /**
   * Ignores clicks until `enable`.
   *
   * @param tabId - Ignored: there are no tabs.
   */
  disable(tabId?: number) {
    return Promise.try(() => {
      tabDetailsSchema.parse({ tabId });
      this.isActionEnabled = false;
    });
  }

  /**
   * Whether clicks are heard.
   *
   * @param tabId - Ignored: there are no tabs.
   * @returns False after `disable`.
   */
  isEnabled(tabId?: number) {
    return Promise.try(() => {
      tabDetailsSchema.parse({ tabId });
      return this.isActionEnabled;
    });
  }

  private showTooltip() {
    this.tray?.update({
      tooltip: tooltipOf({
        title: this.title,
        badge: this.badgeText
      })
    });
  }
}
