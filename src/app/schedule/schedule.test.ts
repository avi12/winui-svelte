import type { TaskBackend } from "./backend.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The generated Task Scheduler XML and the three calls over a fake backend:
// no task is ever created.

const { listScheduledLaunches, scheduleLaunch, unscheduleLaunch } = await import("./tasks.ts");
const { taskXml } = await import("./xml.ts");
const { parseTrigger } = await import("./trigger.ts");

const COMMAND = {
  program: "C:\\Program Files\\nodejs\\node.exe",
  arguments: ["C:\\apps\\my app\\main.js"]
};
const USER = "S-1-5-21-1-2-3-1001";

function xmlWith({ trigger, extra = [] }: {
  trigger: Parameters<typeof taskXml>[0]["trigger"];
  extra?: readonly string[];
}) {
  return taskXml({
    trigger,
    command: COMMAND,
    extra,
    userId: USER
  });
}

function xmlOf(trigger: Parameters<typeof taskXml>[0]["trigger"]) {
  return xmlWith({ trigger });
}

function createFakeBackend() {
  const tasks = new Map<string, string>();
  const backend = {
    userId: () => USER,
    create({ name, xml }) {
      tasks.set(name, xml);
    },
    list: () => [...tasks.keys()],
    remove: name => tasks.delete(name)
  } satisfies TaskBackend;
  return {
    backend,
    tasks
  };
}

test("a logon trigger names the user, with a delay when asked", () => {
  assert.match(xmlOf({ kind: "logon" }), /<LogonTrigger><Enabled>true<\/Enabled><UserId>S-1-5-21-1-2-3-1001<\/UserId><\/LogonTrigger>/u);
  assert.match(
    xmlOf({
      kind: "logon",
      delaySeconds: 30
    }), /<Delay>PT30S<\/Delay>/u
  );
});

test("a daily trigger starts at the time of day, every day by default", () => {
  assert.match(
    xmlOf({
      kind: "daily",
      at: "09:30"
    }), /<StartBoundary>2000-01-01T09:30:00<\/StartBoundary>.*<DaysInterval>1<\/DaysInterval>/u
  );
  assert.match(
    xmlOf({
      kind: "daily",
      at: "23:05",
      everyDays: 3
    }), /<DaysInterval>3<\/DaysInterval>/u
  );
});

test("an interval trigger repeats in hours and minutes", () => {
  assert.match(
    xmlOf({
      kind: "interval",
      everyMinutes: 15
    }), /<Interval>PT15M<\/Interval>/u
  );
  assert.match(
    xmlOf({
      kind: "interval",
      everyMinutes: 90
    }), /<Interval>PT1H30M<\/Interval>/u
  );
  assert.match(
    xmlOf({
      kind: "interval",
      everyMinutes: 120
    }), /<Interval>PT2H<\/Interval>/u
  );
});

test("a once trigger starts at the local date and time", () => {
  const xml = xmlOf({
    kind: "once",
    at: new Date(2030, 4, 6, 7, 8, 9)
  });
  assert.match(xml, /<TimeTrigger><StartBoundary>2030-05-06T07:08:09<\/StartBoundary>/u);
  assert.doesNotMatch(xml, /<Repetition>/u);
});

test("the action quotes the program and the arguments, then escapes the XML", () => {
  const xml = xmlWith({
    trigger: {
      kind: "logon"
    },
    extra: ["--name", "a \"b\" & <c>", "C:\\dir\\"]
  });
  assert.match(xml, /<Command>&quot;C:\\Program Files\\nodejs\\node\.exe&quot;<\/Command>/u);
  assert.match(
    xml,
    /<Arguments>&quot;C:\\apps\\my app\\main\.js&quot; --name &quot;a \\&quot;b\\&quot; &amp; &lt;c&gt;&quot; C:\\dir\\<\/Arguments>/u
  );
});

test("an argument with a control character is refused", () => {
  assert.throws(() => xmlWith({
    trigger: {
      kind: "logon"
    },
    extra: ["a\nb"]
  }), /control character/u);
});

test("a task runs as the user with normal rights and no time limit", () => {
  const xml = xmlOf({ kind: "logon" });
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/u);
  assert.match(xml, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/u);
  assert.match(xml, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/u);
});

test("a trigger that is not one of the four kinds is refused", () => {
  assert.throws(() => parseTrigger({ kind: "weekly" }), /not a valid schedule trigger/u);
  assert.throws(() => parseTrigger({
    kind: "daily",
    at: "25:00"
  }), /not a valid schedule trigger/u);
  assert.throws(() => parseTrigger({
    kind: "interval",
    everyMinutes: 0
  }), /not a valid schedule trigger/u);
  assert.throws(() => parseTrigger({
    kind: "logon",
    extra: 1
  }), /not a valid schedule trigger/u);
  assert.throws(() => parseTrigger({
    kind: "once",
    at: new Date(Number.NaN)
  }), /not a valid schedule trigger/u);
});

test("scheduleLaunch registers the task under the package folder", () => {
  const { backend, tasks } = createFakeBackend();
  scheduleLaunch({
    id: "nightly-sync",
    trigger: {
      kind: "daily",
      at: "03:00"
    },
    arguments: ["--sync"],
    command: COMMAND,
    backend
  });
  const xml = tasks.get("\\winui-svelte\\nightly-sync");
  assert.ok(xml?.includes("--sync"));
});

test("an id that is not an identifier is refused before anything is made", () => {
  const { backend, tasks } = createFakeBackend();
  assert.throws(() => scheduleLaunch({
    id: "..\\evil",
    trigger: {
      kind: "logon"
    },
    command: COMMAND,
    backend
  }), TypeError);
  assert.equal(tasks.size, 0);
});

test("list and unschedule see only the package folder's ids", () => {
  const { backend } = createFakeBackend();
  for (const id of ["a", "b"]) {
    scheduleLaunch({
      id,
      trigger: {
        kind: "logon"
      },
      command: COMMAND,
      backend
    });
  }

  assert.deepEqual(listScheduledLaunches({ backend }), ["a", "b"]);
  assert.equal(
    unscheduleLaunch({
      id: "a",
      backend
    }), true
  );
  assert.equal(
    unscheduleLaunch({
      id: "a",
      backend
    }), false
  );
  assert.deepEqual(listScheduledLaunches({ backend }), ["b"]);
});
