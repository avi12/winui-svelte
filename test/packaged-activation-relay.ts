import { announceProcess, answer } from "./support/test-package.ts";
import { packagedActivation } from "#src/app/activation/packaged.js";

// Started by Windows under a package's identity for a protocol activation
// (test/packaged-activation.test.ts): answers with its own command line and
// what packagedActivation() read from the Windows App SDK.

const [RESULT_FILE = "", ...rest] = process.argv.slice(2);
announceProcess(RESULT_FILE);
answer({
  resultFile: RESULT_FILE,
  value: {
    arguments: rest,
    packaged: packagedActivation() ?? null
  }
});
process.exit(0);
