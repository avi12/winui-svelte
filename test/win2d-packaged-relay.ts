import { ExampleProcess } from "./example-process.ts";
import { announceProcess, answer } from "./support/test-package.ts";

// Runs under a package's identity (test/win2d-packaged.test.ts): starts the
// packaged Win2D example and answers with its redraw counts and everything it
// wrote to stderr, which a packaged process cannot hand out any other way.

const SETTLE_MILLISECONDS = 5000;
const [RESULT_FILE = ""] = process.argv.slice(2);
announceProcess(RESULT_FILE);
const example = ExampleProcess.start({
  entry: "examples/win2d-packaged/main.ts"
});
try {
  await example.ask({
    command: {
      cmd: "stats"
    },
    kind: "stats"
  });
  await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
  const stats = await example.ask({
    command: {
      cmd: "stats"
    },
    kind: "stats"
  });
  answer({
    resultFile: RESULT_FILE,
    value: {
      stats,
      stderr: example.stderr
    }
  });
} catch (error) {
  answer({
    resultFile: RESULT_FILE,
    value: {
      error: String(error),
      stderr: example.stderr
    }
  });
} finally {
  await example.stop();
}
process.exit(0);
