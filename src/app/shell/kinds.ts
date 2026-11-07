/** Why a shell verb did nothing. */
export const ShellFailure = {
  INVALID: "invalid",
  NOT_FOUND: "not-found",
  EXISTS: "exists",
  OWNED_BY_ANOTHER: "owned-by-another",
  ABORTED: "aborted",
  FAILED: "failed"
} as const;

/** One of `ShellFailure`'s values. */
export type ShellFailure = (typeof ShellFailure)[keyof typeof ShellFailure];

/** What a shell verb reports: it worked, or it did nothing and says why. */
export type ShellResult = { readonly ok: true } | {
  readonly ok: false;
  readonly reason: ShellFailure;
  readonly message: string;
};

/**
 * A failed `ShellResult`.
 *
 * @param options - The reason and a sentence for a person.
 * @returns The result.
 */
export function failure({ reason, message }: {
  reason: ShellFailure;
  message: string;
}) {
  return {
    ok: false,
    reason,
    message
  } as const;
}

/** A successful `ShellResult`. */
export const SUCCESS = { ok: true } as const;

/**
 * A `failed` result from something a call threw.
 *
 * @param error - What was thrown.
 * @returns The result, with the error's message.
 */
export function failedWith(error: unknown) {
  return failure({
    reason: ShellFailure.FAILED,
    message: error instanceof Error ? error.message : String(error)
  });
}
