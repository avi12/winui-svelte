// What registering a hotkey can fail with.

/** Why a hotkey could not be registered. */
export class HotkeyError extends Error {
  override readonly name: string = "HotkeyError";
}

/** The keys are not a hotkey: an empty or unknown part, a modifier named twice, or no key. */
export class HotkeyParseError extends HotkeyError {
  override readonly name: string = "HotkeyParseError";
}

/** Another app, or this one, already owns the combination (`ERROR_HOTKEY_ALREADY_REGISTERED`). */
export class HotkeyConflictError extends HotkeyError {
  override readonly name: string = "HotkeyConflictError";
}

/** Windows refused the hotkey for another reason, such as a reserved combination; `code` is its error code. */
export class HotkeyRefusedError extends HotkeyError {
  override readonly name: string = "HotkeyRefusedError";
  readonly code: number;

  constructor({ message, code }: {
    message: string;
    code: number;
  }) {
    super(message);
    this.code = code;
  }
}
