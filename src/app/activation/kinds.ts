/** What an activation of the app was: the one field to switch on. */
export const ActivationKind = {
  launch: "launch",
  file: "file",
  protocol: "protocol",
  startup: "startup",
  redirect: "redirect"
} as const;
/** One of the values of `ActivationKind`. */
export type ActivationKind = (typeof ActivationKind)[keyof typeof ActivationKind];

interface ActivationBase {
  /** True when a later copy of the app was started and handed this over; false for this copy's own start. */
  readonly isRedirect: boolean;

  /** The command line arguments, without the program and without the startup marker. */
  readonly arguments: readonly string[];

  /** The folder the arguments are relative to. */
  readonly workingDirectory: string;
}

/** This copy was started by hand, with nothing to open. */
export interface LaunchActivation extends ActivationBase {
  readonly kind: typeof ActivationKind.launch;
}

/** One or more files were opened with the app. */
export interface FileActivation extends ActivationBase {
  readonly kind: typeof ActivationKind.file;

  /** The absolute paths of the existing files, in order. */
  readonly files: readonly string[];
}

/** A link of a registered scheme was opened. */
export interface ProtocolActivation extends ActivationBase {
  readonly kind: typeof ActivationKind.protocol;

  /** The address as received, such as `note:open?id=1`; data, never to be run. */
  readonly uri: string;

  /** The scheme in lower case, such as `note`. */
  readonly scheme: string;
}

/** Windows started the app at sign-in (see `launchAtLogin`). */
export interface StartupActivation extends ActivationBase {
  readonly kind: typeof ActivationKind.startup;
}

/** A later copy of the app was started with nothing to open, and handed over to this one. */
export interface RedirectActivation extends ActivationBase {
  readonly kind: typeof ActivationKind.redirect;
}

/** Every way the app is activated, as one event. */
export type ActivationEvent =
  | LaunchActivation
  | FileActivation
  | ProtocolActivation
  | StartupActivation
  | RedirectActivation;
