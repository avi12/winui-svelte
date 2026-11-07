import { DialogResult } from "./dialog-types.ts";
import type { DialogButton, DialogHost, DialogRequest, DialogSpec } from "./dialog-types.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { boxed } from "#src/renderer/host/values.js";
import type { WindowHandle } from "#src/window/window-handle.js";
import {
  ContentDialog,
  ContentDialogButton,
  ContentDialogResult,
  FocusState,
  StackPanel,
  TextBlock,
  TextBox,
  TextWrapping,
  WindowActivationState
} from "#src/winui.js";

const CONTENT_SPACING = 12;

/** The part of a `WindowHandle` the dialogs use: `bind:handle` on `<Window>` gives one. */
export type DialogWindow = Pick<WindowHandle, "window">;

const BUTTONS = {
  none: ContentDialogButton.None,
  primary: ContentDialogButton.Primary,
  secondary: ContentDialogButton.Secondary,
  close: ContentDialogButton.Close
} as const satisfies Record<DialogButton, ContentDialogButton>;

function answerOf({ result, text }: {
  result: ContentDialogResult;
  text: string | undefined;
}) {
  const isPrimary = result === ContentDialogResult.Primary;
  if (isPrimary) {
    return {
      result: DialogResult.PRIMARY,
      text
    };
  }

  const isSecondary = result === ContentDialogResult.Secondary;
  if (isSecondary) {
    return { result: DialogResult.SECONDARY };
  }

  return { result: DialogResult.NONE };
}

function inputBoxOf(input: NonNullable<DialogSpec["input"]>) {
  const box = new TextBox();
  box.text = input.value ?? "";
  box.placeholderText = input.placeholder ?? "";
  box.acceptsReturn = input.isMultiline ?? false;
  return box;
}

/** The dialogs over the app's windows: the one activated last is the one a dialog opens in. */
export class WindowDialogHost implements DialogHost {
  // In the order of activation: the foreground window is the last.
  private readonly windows: DialogWindow[] = [];

  /** Starts opening dialogs in this window; returns what stops it. */
  attach(handle: DialogWindow) {
    this.windows.push(handle);
    const { window } = handle;
    const stopActivated = window.onActivated((_sender, args) => {
      const isActive = args.windowActivationState !== WindowActivationState.Deactivated;
      if (isActive) {
        this.remove(handle);
        this.windows.push(handle);
      }
    });
    const stopClosed = window.onClosed(() => this.remove(handle));
    return () => {
      stopActivated();
      stopClosed();
      this.remove(handle);
    };
  }

  /** Whether a window is there to open a dialog in. */
  hasWindow() {
    return this.windows.length > 0;
  }

  /** Shows the dialog in the foreground window and resolves when it closes. */
  async show({ spec, signal }: DialogRequest) {
    const target = this.windows.at(-1);
    const hasNoWindow = target === undefined;
    if (hasNoWindow) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "No window to open a dialog in: give one to useDialogWindow"
      });
    }

    const dialog = new ContentDialog();
    dialog.xamlRoot = target.window.content.xamlRoot;
    dialog.title = boxed(spec.title);
    dialog.primaryButtonText = spec.primaryButtonText;
    dialog.secondaryButtonText = spec.secondaryButtonText;
    dialog.closeButtonText = spec.closeButtonText;
    dialog.defaultButton = BUTTONS[spec.defaultButton];
    const message = new TextBlock();
    message.text = spec.content;
    message.textWrapping = TextWrapping.Wrap;
    const box = spec.input === undefined ? undefined : inputBoxOf(spec.input);
    const hasNoInput = box === undefined;
    if (hasNoInput) {
      dialog.content = message;
    } else {
      const stack = new StackPanel();
      stack.spacing = CONTENT_SPACING;
      stack.children.append(message);
      stack.children.append(box);
      dialog.content = stack;
      dialog.onceOpened(() => {
        box.focus(FocusState.Programmatic);
        box.selectAll();
      });
    }

    function hide() {
      dialog.hide();
    }

    signal?.addEventListener("abort", hide, { once: true });
    const result = await dialog.showAsync();
    signal?.removeEventListener("abort", hide);
    return answerOf({
      result,
      text: box?.text
    });
  }

  private remove(handle: DialogWindow) {
    const iWindow = this.windows.indexOf(handle);
    const isKnown = iWindow !== -1;
    if (isKnown) {
      this.windows.splice(iWindow, 1);
    }
  }
}
