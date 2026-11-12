import { DialogButton, DialogResult } from "./dialog-types.ts";
import type { DialogHost, DialogOptions } from "./dialog-types.ts";
import { WindowDialogHost } from "./dialogs-windows.ts";
import type { DialogWindow } from "./dialogs-windows.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import { dialogQueue } from "#src/components/hand-written/overlay/overlay-queue.js";
import { NoticeButton, NoticeButtons, NoticeIcon, showNotice } from "#src/notice/notice.js";
import type { NoticeOptions } from "#src/notice/notice.js";

export { DialogButton, DialogResult } from "./dialog-types.ts";
export type { DialogAnswer, DialogHost, DialogInput, DialogOptions, DialogRequest, DialogSpec } from "./dialog-types.ts";

const DEFAULT_TITLE = "Message";
const DEFAULT_OK_TEXT = "OK";
const DEFAULT_CANCEL_TEXT = "Cancel";

/** What `installDialogs` takes. */
export interface DialogInstallOptions {
  /** The title of the dialogs. Default "Message". */
  readonly title?: string;

  /** The text of the OK button. Default "OK". */
  readonly okText?: string;

  /** The text of the Cancel button. Default "Cancel". */
  readonly cancelText?: string;

  /** Stands in for the windows; the tests give one. Default the windows `useDialogWindow` was given. */
  readonly host?: DialogHost;

  /** Stands in for the message box shown when there is no window. Default `showNotice`. */
  readonly notice?: (options: NoticeOptions) => Promise<NoticeButton>;
}

interface DialogContext {
  readonly title: string;
  readonly okText: string;
  readonly cancelText: string;
  readonly host: DialogHost;
  readonly notice: (options: NoticeOptions) => Promise<NoticeButton>;
}

let installed: DialogContext | undefined;
let defaultHost: WindowDialogHost | undefined;

function windowHost() {
  defaultHost ??= new WindowDialogHost();
  return defaultHost;
}

function contextOf({ options, host }: {
  options: DialogInstallOptions;
  host: DialogHost;
}) {
  return {
    title: options.title ?? DEFAULT_TITLE,
    okText: options.okText ?? DEFAULT_OK_TEXT,
    cancelText: options.cancelText ?? DEFAULT_CANCEL_TEXT,
    host,
    notice: options.notice ?? showNotice
  };
}

function currentContext() {
  return installed ?? contextOf({
    options: {},
    host: windowHost()
  });
}

function specOf({ options, context }: {
  options: DialogOptions;
  context: DialogContext;
}) {
  const primaryButtonText = options.primaryButtonText ?? "";
  const secondaryButtonText = options.secondaryButtonText ?? "";
  const closeButtonText = options.closeButtonText ?? "";
  const hasButton = primaryButtonText !== "" || secondaryButtonText !== "" || closeButtonText !== "";
  return {
    title: options.title ?? context.title,
    content: options.content,
    primaryButtonText,
    secondaryButtonText,
    closeButtonText: hasButton ? closeButtonText : context.okText,
    defaultButton: options.defaultButton ?? DialogButton.NONE,
    input: options.input
  };
}

function abortError() {
  return domException({
    name: DomErrorName.ABORT,
    message: "The dialog was aborted before it was shown"
  });
}

async function showIn({ options, context }: {
  options: DialogOptions;
  context: DialogContext;
}) {
  const { host } = context;
  const hasWindow = host.hasWindow();
  if (!hasWindow) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "No window to open a dialog in: give one to useDialogWindow"
    });
  }

  const spec = specOf({
    options,
    context
  });
  const { signal } = options;
  const isAborted = signal?.aborted === true;
  if (isAborted) {
    throw abortError();
  }

  const ticket = dialogQueue().enqueue({
    show: () => host.show({
      spec,
      signal
    })
  });
  function giveUpTurn() {
    ticket.cancel();
  }

  signal?.addEventListener("abort", giveUpTurn, { once: true });
  const answer = await ticket.result;
  signal?.removeEventListener("abort", giveUpTurn);
  const isCancelled = answer === undefined;
  if (isCancelled) {
    throw abortError();
  }

  return answer;
}

/**
 * Shows a WinUI `ContentDialog` in the foreground window and resolves when it
 * closes. WinUI shows one dialog at a time, so dialogs asked for while another
 * is open wait their turn, in order (the `ContentDialog` components stand in
 * the same line).
 *
 * @param options - The message, the title, the three buttons, the default button and a text box.
 * @returns How the dialog ended.
 * @throws {DOMException} `InvalidStateError` when no window was given to `useDialogWindow`.
 */
export function showDialog(options: DialogOptions) {
  return showIn({
    options,
    context: currentContext()
  });
}

/**
 * The web's `alert`, as a promise: resolves when the user closes the dialog.
 * With no window, a message box (`showNotice`) is shown instead.
 *
 * @param message - What to show; anything is shown as text.
 */
export async function showAlert(message: unknown = "") {
  const context = currentContext();
  const content = String(message);
  const hasWindow = context.host.hasWindow();
  if (!hasWindow) {
    await context.notice({
      title: context.title,
      message: content,
      icon: NoticeIcon.INFORMATION
    });
    return;
  }

  await showIn({
    options: {
      content,
      closeButtonText: context.okText,
      defaultButton: DialogButton.CLOSE
    },
    context
  });
}

/**
 * The web's `confirm`, as a promise: resolves `true` when the user chose OK.
 * With no window, a message box (`showNotice`) is shown instead.
 *
 * @param message - The question; anything is shown as text.
 * @returns Whether the user chose OK.
 */
export async function showConfirm(message: unknown = "") {
  const context = currentContext();
  const content = String(message);
  const hasWindow = context.host.hasWindow();
  if (!hasWindow) {
    const pressed = await context.notice({
      title: context.title,
      message: content,
      icon: NoticeIcon.QUESTION,
      buttons: NoticeButtons.OK_CANCEL
    });
    return pressed === NoticeButton.OK;
  }

  const answer = await showIn({
    options: {
      content,
      primaryButtonText: context.okText,
      closeButtonText: context.cancelText,
      defaultButton: DialogButton.PRIMARY
    },
    context
  });
  return answer.result === DialogResult.PRIMARY;
}

/**
 * The web's `prompt`, as a promise: resolves with the text when the user chose
 * OK, and `null` otherwise. Needs a window (a message box has no text box).
 *
 * @param message - The question; anything is shown as text.
 * @param defaultValue - What the box starts with.
 * @returns The text, or `null` when the user cancelled.
 * @throws {DOMException} `InvalidStateError` when no window was given to `useDialogWindow`.
 */
export async function showPrompt(message: unknown = "", defaultValue = "") {
  const context = currentContext();
  const answer = await showIn({
    options: {
      content: String(message),
      primaryButtonText: context.okText,
      closeButtonText: context.cancelText,
      defaultButton: DialogButton.PRIMARY,
      input: {
        value: defaultValue
      }
    },
    context
  });
  const isConfirmed = answer.result === DialogResult.PRIMARY;
  if (!isConfirmed) {
    return null;
  }

  return answer.text ?? "";
}

/**
 * Tells the dialogs which windows they open in: call it with the handle
 * `bind:handle` gives on `<Window>`, for each window. A dialog opens in the
 * window that was active last.
 *
 * @param handle - The window; only its `window` is used.
 * @returns A function that stops opening dialogs in the window.
 * @throws {DOMException} `InvalidStateError` when `installDialogs` was given a host of its own.
 */
export function useDialogWindow(handle: DialogWindow) {
  const { host } = currentContext();
  const isWindowHost = host instanceof WindowDialogHost;
  if (!isWindowHost) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The dialogs were installed with a host of their own: they have no windows to follow"
    });
  }

  return host.attach(handle);
}

/**
 * Defines `alert`, `confirm` and `prompt` on the global scope over WinUI
 * `ContentDialog`. They return promises where the browser's return at once,
 * because a dialog cannot block the thread that pumps the window: `await` them.
 * Call it on the thread the app's code runs on.
 *
 * @param options - The dialogs' title and button texts, and test stand-ins.
 * @returns The function that takes them away again.
 */
export function installDialogs(options: DialogInstallOptions = {}) {
  const previous = installed;
  installed = contextOf({
    options,
    host: options.host ?? windowHost()
  });
  const stops = [
    defineProperty({
      name: "alert",
      value: (message?: unknown) => showAlert(message)
    }),
    defineProperty({
      name: "confirm",
      value: (message?: unknown) => showConfirm(message)
    }),
    defineProperty({
      name: "prompt",
      value: (message?: unknown, defaultValue?: string) => showPrompt(message, defaultValue)
    })
  ];
  return () => {
    for (const stop of stops.reverse()) {
      stop();
    }

    installed = previous;
  };
}
