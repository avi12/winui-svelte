/** The button a dialog closed with, as WinUI's `ContentDialogResult` has it. */
export const DialogResult = {
  NONE: "none",
  PRIMARY: "primary",
  SECONDARY: "secondary"
} as const;
/** One of the values of `DialogResult`. */
export type DialogResult = (typeof DialogResult)[keyof typeof DialogResult];

/** The button Enter presses, as WinUI's `ContentDialogButton` has it. */
export const DialogButton = {
  NONE: "none",
  PRIMARY: "primary",
  SECONDARY: "secondary",
  CLOSE: "close"
} as const;
/** One of the values of `DialogButton`. */
export type DialogButton = (typeof DialogButton)[keyof typeof DialogButton];

/** A text box in the dialog. */
export interface DialogInput {
  /** What the box starts with. Default empty. */
  readonly value?: string;

  /** The grey hint shown while the box is empty. */
  readonly placeholder?: string;

  /** Whether Enter starts a new line. Default false. */
  readonly isMultiline?: boolean;
}

/** What `showDialog` shows. */
export interface DialogOptions {
  /** The message. */
  readonly content: string;

  /** The title above the message. Default the installed `title`. */
  readonly title?: string;

  /** The accent-coloured button's text; the button is hidden when empty. */
  readonly primaryButtonText?: string;

  /** The middle button's text; the button is hidden when empty. */
  readonly secondaryButtonText?: string;

  /**
   * The bottom button's text; the button is hidden when empty. When no button
   * has text, the dialog gets a close button with the installed OK text.
   */
  readonly closeButtonText?: string;

  /** The button Enter presses. Default `DialogButton.NONE`. */
  readonly defaultButton?: DialogButton;

  /** A text box under the message. */
  readonly input?: DialogInput;

  /**
   * Aborting it closes the dialog like Escape (the answer is `DialogResult.NONE`),
   * or, while the dialog still waits for its turn, rejects with `AbortError`.
   */
  readonly signal?: AbortSignal;
}

/** How a dialog ended: `text` is what the box held when the primary button closed a dialog that had one. */
export type DialogAnswer =
  | {
    readonly result: typeof DialogResult.PRIMARY;
    readonly text: string | undefined;
  }
  | {
    readonly result: typeof DialogResult.SECONDARY | typeof DialogResult.NONE;
  };

/** A dialog with every default filled in: what a `DialogHost` is asked to show. */
export interface DialogSpec {
  readonly title: string;
  readonly content: string;
  readonly primaryButtonText: string;
  readonly secondaryButtonText: string;
  readonly closeButtonText: string;
  readonly defaultButton: DialogButton;
  readonly input: DialogInput | undefined;
}

/** What a `DialogHost` is asked: the dialog, and the signal that closes it. */
export interface DialogRequest {
  readonly spec: DialogSpec;
  readonly signal: AbortSignal | undefined;
}

/** What shows a dialog: the windows' `ContentDialog`, or a stand-in in a test. */
export interface DialogHost {
  /** Whether a window is there to open a dialog in. */
  hasWindow(): boolean;

  /** Shows the dialog in the foreground window and resolves when it closes; one dialog at a time. */
  show(request: DialogRequest): Promise<DialogAnswer>;
}
