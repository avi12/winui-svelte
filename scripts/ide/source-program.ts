import path from "node:path";
import typescript from "typescript";

// The TypeScript program over the package's sources, for the generators that
// read what the code says (a closed set's members, a function's tag) rather
// than run it: running it needs the WinUI bindings loaded. The `#winui/*`
// bindings resolve to what `winapp` generated, as the editors see them.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const BINDINGS_PATH = ".winapp/bindings/*.d.ts";

/** A program over the entry files and what they import, with the repository's compiler options. */
export function sourceProgram(entries: string[]) {
  const config = typescript.getParsedCommandLineOfConfigFile(path.join(PACKAGE_ROOT, "tsconfig.json"), {}, {
    ...typescript.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    }
  });
  const options = {
    ...config?.options,
    noEmit: true,
    paths: {
      "#winui/*": [BINDINGS_PATH]
    },
    pathsBasePath: PACKAGE_ROOT
  };
  return typescript.createProgram(entries, options);
}
