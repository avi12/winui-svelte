import assert from "node:assert/strict";
import { test } from "node:test";

// Relaunch and restart registration: the command line Windows is given, the
// flags that leave out what was not asked for, and the order of a relaunch.
// A real registration and a real second copy are for test/app.test.ts.

const { commandOf, joinCommandLine } = await import("./launch-command.ts");
const { exclusionFlags, registerRestart, RestartCondition } = await import("./restart-after-crash.ts");
const { relaunchWith } = await import("./relaunch.ts");

const FLAG_NO_CRASH = 1;
const FLAG_NO_HANG = 2;
const FLAG_NO_PATCH = 4;
const FLAG_NO_REBOOT = 8;
const FAILED = -2147024809;

test("a command line quotes what CommandLineToArgvW would split", () => {
  assert.equal(joinCommandLine(["a", "b c", "", "d\"e", "f\\"]), "a \"b c\" \"\" \"d\\\"e\" f\\");
  assert.equal(joinCommandLine(["a b\\"]), "\"a b\\\\\"");
});

test("a launch command is Node, its flags, the script, then the arguments", () => {
  const command = commandOf({
    appArguments: ["--key", "k"],
    executable: "node.exe",
    nodeFlags: ["--no-warnings"],
    script: "C:/app/main.ts"
  });
  assert.deepEqual(command, {
    executable: "node.exe",
    arguments: ["--no-warnings", "C:/app/main.ts", "--key", "k"]
  });
});

test("the flags exclude every condition not asked for", () => {
  assert.equal(exclusionFlags(Object.values(RestartCondition)), 0);
  assert.equal(exclusionFlags([RestartCondition.crash]), FLAG_NO_HANG | FLAG_NO_PATCH | FLAG_NO_REBOOT);
  assert.equal(exclusionFlags([]), FLAG_NO_CRASH | FLAG_NO_HANG | FLAG_NO_PATCH | FLAG_NO_REBOOT);
});

test("the registration carries the quoted command line, and a refusal throws", () => {
  const registered: Array<{
    commandLine: string;
    flags: number;
  }> = [];
  registerRestart({
    arguments: ["--mode", "after crash"],
    conditions: [RestartCondition.update],
    register(request) {
      registered.push(request);
      return 0;
    }
  });
  assert.equal(registered.length, 1);
  assert.match(registered[0]?.commandLine ?? "", /--mode "after crash"$/u);
  assert.equal(registered[0]?.flags, FLAG_NO_CRASH | FLAG_NO_HANG | FLAG_NO_REBOOT);
  assert.throws(() => registerRestart({
    arguments: [],
    register: () => FAILED
  }), /refused/u);
});

test("a relaunch releases the claim, starts the copy, then exits", () => {
  const steps: string[] = [];
  relaunchWith({
    arguments: ["--again"],
    instance: {
      release: () => steps.push("release")
    },
    effects: {
      start: command => steps.push(`start ${command.arguments.at(-1)}`),
      exit: () => steps.push("exit")
    }
  });
  assert.deepEqual(steps, ["release", "start --again", "exit"]);
});
