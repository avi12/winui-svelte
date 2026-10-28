import type { Report } from "./example-process.ts";
import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The overlays example (examples/overlays) in a real WinUI window, off screen
// and never activated: a flyout, a menu flyout in a button, and two
// ContentDialogs open from state, and what the user does to them (light
// dismiss, a dialog's close button) comes back to the state. Skipped where the
// Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const WAIT_MILLISECONDS = 30_000;
const POLL_MILLISECONDS = 400;

async function sleep(milliseconds: number) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

// Asks for the example's state until `isMet` holds: WinUI opens and closes an
// overlay on its own schedule (a dialog animates both ways).
async function until({ example, what, isMet }: {
  example: ExampleProcess;
  what: string;
  isMet: (report: Report) => boolean;
}) {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  for (;;) {
    const report = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    if (isMet(report)) {
      return report;
    }

    const isLate = Date.now() > deadline;
    if (isLate) {
      throw new Error(`${what} did not happen within ${WAIT_MILLISECONDS} ms: ${JSON.stringify(report)}`);
    }

    await sleep(POLL_MILLISECONDS);
  }
}

function open({ example, name, isOpen }: {
  example: ExampleProcess;
  name: string;
  isOpen: boolean;
}) {
  example.send({
    cmd: "open",
    name,
    isOpen
  });
}

function dismiss({ example, name }: {
  example: ExampleProcess;
  name: string;
}) {
  example.send({
    cmd: "dismiss",
    name
  });
}

function shownOf({ report, name }: {
  report: Report;
  name: string;
}) {
  return numberOf({
    report,
    field: `${name}Shown`
  });
}

test("flyouts and dialogs open and close from state, follow the user, and dialogs take turns", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/overlays/main.ts" });
  try {
    const started = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(
      shownOf({
        report: started,
        name: "flyout"
      }), 0
    );

    // A flyout opens next to the panel it is written in, and closes.
    open({
      example,
      name: "flyout",
      isOpen: true
    });
    await until({
      example,
      what: "the flyout opening",
      isMet: report => shownOf({
        report,
        name: "flyout"
      }) === 1
    });
    open({
      example,
      name: "flyout",
      isOpen: false
    });
    await until({
      example,
      what: "the flyout closing",
      isMet: report => shownOf({
        report,
        name: "flyout"
      }) === 0
    });

    // Light dismiss reaches the state.
    open({
      example,
      name: "flyout",
      isOpen: true
    });
    await until({
      example,
      what: "the flyout opening again",
      isMet: report => shownOf({
        report,
        name: "flyout"
      }) === 1
    });
    dismiss({
      example,
      name: "flyout"
    });
    await until({
      example,
      what: "open following the flyout the user closed",
      isMet: report => report["flyoutOpen"] === false
    });

    // A menu flyout in a button's flyout snippet opens next to the button.
    open({
      example,
      name: "menu",
      isOpen: true
    });
    await until({
      example,
      what: "the menu flyout opening",
      isMet: report => shownOf({
        report,
        name: "menu"
      }) === 1
    });
    dismiss({
      example,
      name: "menu"
    });
    await until({
      example,
      what: "open following the menu the user closed",
      isMet: report => report["menuOpen"] === false
    });

    // Two dialogs asked for together: the second waits, WinUI would refuse it.
    open({
      example,
      name: "first",
      isOpen: true
    });
    open({
      example,
      name: "second",
      isOpen: true
    });
    const firstShown = await until({
      example,
      what: "the first dialog opening",
      isMet: report => shownOf({
        report,
        name: "first"
      }) === 1
    });
    assert.equal(
      shownOf({
        report: firstShown,
        name: "second"
      }), 0, "the second dialog opened over the first"
    );
    assert.equal(firstShown["secondOpen"], true, "open stays true while the dialog waits");

    // The user closes the first: open follows, onResult answers, the second opens.
    dismiss({
      example,
      name: "first"
    });
    const secondShown = await until({
      example,
      what: "the second dialog opening after the first closed",
      isMet: report => shownOf({
        report,
        name: "second"
      }) === 1
    });
    assert.equal(secondShown["firstOpen"], false);
    assert.match(String(secondShown["results"]), /first:0/u);

    open({
      example,
      name: "second",
      isOpen: false
    });
    const done = await until({
      example,
      what: "the second dialog closing",
      isMet: report => shownOf({
        report,
        name: "second"
      }) === 0 && /second:0/u.test(String(report["results"]))
    });
    assert.equal(done["secondOpen"], false);

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
