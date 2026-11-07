function locate({ source, offset }: {
  source: string;
  offset: number;
}) {
  const before = source.slice(0, offset).split("\n");
  return {
    line: before.length,
    column: (before.at(-1)?.length ?? 0) + 1
  };
}

/**
 * A construct `entrypoints/tray.svelte` uses that the build cannot lower to
 * plain code; the message names the file, the line and the construct.
 */
export class TraySvelteError extends Error {
  constructor({ file, source, offset, construct, reason }: {
    file: string;
    source: string;
    offset: number;
    construct: string;
    reason: string;
  }) {
    const { line, column } = locate({
      source,
      offset
    });
    super(`${file}:${line}:${column}: ${construct} is not supported in a tray.svelte: ${reason}`);
    this.name = "TraySvelteError";
  }
}
