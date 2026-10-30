const ORPHAN_ERROR = "effect_orphan";

/**
 * Arranges for `stop` to run when the work it ends is over: when the
 * component (or `$effect.root`) that called the rune is destroyed, and when
 * `signal` aborts. Called outside any component or root there is no scope to
 * end, so only the signal and the caller's own call to `stop` do.
 *
 * @param options - What to run, and the signal that also ends the work.
 */
export function stopWhenDone({ stop, signal }: {
  stop: () => void;
  signal?: AbortSignal | undefined;
}) {
  signal?.addEventListener("abort", stop, { once: true });
  const isAlreadyAborted = signal?.aborted === true;
  if (isAlreadyAborted) {
    stop();
    return;
  }

  try {
    $effect(() => stop);
  } catch (thrown) {
    const isOutsideScope = thrown instanceof Error && thrown.message.includes(ORPHAN_ERROR);
    if (!isOutsideScope) {
      throw thrown;
    }
  }
}
