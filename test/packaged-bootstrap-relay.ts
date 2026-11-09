import { ExampleProcess } from "./example-process.ts";
import { announceProcess, answer } from "./support/test-package.ts";

// Runs under a package's identity (test/packaged-bootstrap.test.ts): starts the
// window example, whose launcher calls initWindowsAppSdk unchanged, and answers
// with what the launcher reported and what the window shows. Its own process
// and the launcher it starts both have the identity.

const [RESULT_FILE = ""] = process.argv.slice(2);
announceProcess(RESULT_FILE);
const example = ExampleProcess.start({
  entry: "examples/window/main.ts"
});
try {
  const info = await example.ask({
    command: {
      cmd: "info"
    },
    kind: "info"
  });
  answer({
    resultFile: RESULT_FILE,
    value: {
      runtime: example.reported("runtime"),
      info
    }
  });
} catch (error) {
  answer({
    resultFile: RESULT_FILE,
    value: {
      error: String(error)
    }
  });
} finally {
  await example.stop();
}
process.exit(0);
