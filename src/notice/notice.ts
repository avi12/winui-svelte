import { createNoticeNative } from "./native.ts";
import type { NoticeNative } from "./native.ts";

const OWNER_NONE = 0n;
const MB_SETFOREGROUND = 0x10000;
const MB_TOPMOST = 0x40000;

/** The picture beside the message. */
export const NoticeIcon = {
  NONE: "none",
  INFORMATION: "information",
  WARNING: "warning",
  ERROR: "error",
  QUESTION: "question"
} as const;

/** One of `NoticeIcon`'s values. */
export type NoticeIcon = typeof NoticeIcon[keyof typeof NoticeIcon];

/** The set of buttons the notice shows. */
export const NoticeButtons = {
  OK: "ok",
  OK_CANCEL: "okCancel",
  YES_NO: "yesNo",
  YES_NO_CANCEL: "yesNoCancel",
  RETRY_CANCEL: "retryCancel",
  ABORT_RETRY_IGNORE: "abortRetryIgnore"
} as const;

/** One of `NoticeButtons`'s values. */
export type NoticeButtons = typeof NoticeButtons[keyof typeof NoticeButtons];

/** The button the user pressed. */
export const NoticeButton = {
  OK: "ok",
  CANCEL: "cancel",
  YES: "yes",
  NO: "no",
  RETRY: "retry",
  ABORT: "abort",
  IGNORE: "ignore"
} as const;

/** One of `NoticeButton`'s values. */
export type NoticeButton = typeof NoticeButton[keyof typeof NoticeButton];

/** What `showNotice` shows. */
export interface NoticeOptions {
  /** The title bar's text. */
  readonly title: string;

  /** The message. */
  readonly message: string;

  /** Default `NoticeIcon.NONE`. */
  readonly icon?: NoticeIcon;

  /** Default `NoticeButtons.OK`. */
  readonly buttons?: NoticeButtons;

  /**
   * The window handle (an `HWND`) the notice belongs to: it is centered on it
   * and blocks it. Default none, a notice of its own that stays above other windows.
   */
  readonly owner?: bigint;
}

/** What `showNotice` takes beyond the options: a test's stand-in. */
export interface NoticeSeams {
  /** The Win32 call; the real one by default. */
  readonly native?: NoticeNative;
}

const ICON_FLAGS = {
  [NoticeIcon.NONE]: 0x0,
  [NoticeIcon.ERROR]: 0x10,
  [NoticeIcon.QUESTION]: 0x20,
  [NoticeIcon.WARNING]: 0x30,
  [NoticeIcon.INFORMATION]: 0x40
} as const;

const BUTTON_FLAGS = {
  [NoticeButtons.OK]: 0x0,
  [NoticeButtons.OK_CANCEL]: 0x1,
  [NoticeButtons.ABORT_RETRY_IGNORE]: 0x2,
  [NoticeButtons.YES_NO_CANCEL]: 0x3,
  [NoticeButtons.YES_NO]: 0x4,
  [NoticeButtons.RETRY_CANCEL]: 0x5
} as const;

const ANSWER = {
  OK: 1,
  CANCEL: 2,
  ABORT: 3,
  RETRY: 4,
  IGNORE: 5,
  YES: 6,
  NO: 7
} as const;

const BUTTON_OF_ANSWER = new Map<number, NoticeButton>([
  [ANSWER.OK, NoticeButton.OK],
  [ANSWER.CANCEL, NoticeButton.CANCEL],
  [ANSWER.ABORT, NoticeButton.ABORT],
  [ANSWER.RETRY, NoticeButton.RETRY],
  [ANSWER.IGNORE, NoticeButton.IGNORE],
  [ANSWER.YES, NoticeButton.YES],
  [ANSWER.NO, NoticeButton.NO]
]);

/**
 * Shows a message box and resolves with the button the user pressed. It is
 * Windows' own `MessageBoxW`: it needs no window, no app and no WinUI, so
 * plain Node can call it before anything else has started (the Windows 11
 * check, a revoked licence). The dialog is modal and keeps its own message
 * loop, so the calling thread is busy until it closes. Closing it with the
 * title bar's close button answers `NoticeButton.CANCEL` (or `NoticeButton.OK`
 * for an OK-only notice).
 *
 * @param options - The title, the message, the icon, the buttons and the owner.
 * @returns The button pressed.
 * @throws {Error} When Windows could not show the box (a bad owner handle, say).
 */
export async function showNotice({
  title,
  message,
  icon = NoticeIcon.NONE,
  buttons = NoticeButtons.OK,
  owner = OWNER_NONE,
  native = createNoticeNative()
}: NoticeOptions & NoticeSeams) {
  const hasOwner = owner !== OWNER_NONE;
  const placement = hasOwner ? 0 : MB_TOPMOST | MB_SETFOREGROUND;
  const flags = ICON_FLAGS[icon] | BUTTON_FLAGS[buttons] | placement;
  const answer = native.messageBox({
    owner,
    title,
    message,
    flags
  });
  const pressed = BUTTON_OF_ANSWER.get(answer);
  const isUnknown = pressed === undefined;
  if (isUnknown) {
    throw new Error(`the notice could not be shown (MessageBoxW answered ${answer})`);
  }

  return pressed;
}
