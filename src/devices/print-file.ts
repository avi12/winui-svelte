import { shellPrint } from "./native.ts";

const SHELL_SUCCESS_ABOVE = 32n;

/** A file the shell could not print. */
export class PrintFileError extends Error {
  override readonly name = "PrintFileError";
  readonly code: number;

  constructor({ message, code }: {
    message: string;
    code: number;
  }) {
    super(message);
    this.code = code;
  }
}

/**
 * Prints a file through the program registered for its type, as Explorer's
 * Print command does (`ShellExecuteW` with the `print` verb, or `printto`
 * when a printer is named). This sends a real print job to the printer and,
 * for some programs, opens that program briefly.
 *
 * Windows' own print dialog for an app
 * (`PrintManagerInterop.ShowPrintUIForWindowAsync`) is not offered: it needs a
 * XAML `PrintDocument` handed to a `PrintTaskRequested` handler, which the
 * bindings give an unpackaged app no way to build.
 *
 * @param options - The file's path, the printer's name (the default printer when omitted), and the owner window handle.
 * @throws {PrintFileError} When the file has no program registered to print it, or the shell refuses.
 */
export function printFile(options: {
  path: string;
  printerName?: string;
  window?: bigint;
}) {
  const code = shellPrint(options);
  const isRefused = code <= SHELL_SUCCESS_ABOVE;
  if (isRefused) {
    throw new PrintFileError({
      message: `the shell could not print ${options.path} (code ${code}): no program is registered to print this type, or the file is missing`,
      code: Number(code)
    });
  }
}
