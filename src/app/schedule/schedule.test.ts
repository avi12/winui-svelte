import type { TaskBackend } from "./backend.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The generated Task Scheduler XML, the marker argument and the five calls
// over a fake backend: no task is ever created.

const { clear, clearAll, create, get, getAll } = await import("./alarms.ts");
const { alarmTaskXml } = await import("./xml.ts");
const { onAlarm, onStartup, dispatchAlarm, dispatchStartup } = await import("./events.ts");
const { latestOccurrence, nextOccurrence } = await import("./occurrence.ts");
const { alarmArgument, splitAlarmArgument } = await import("#src/app/activation/alarm-argument.js");
const { classifyActivation } = await import("#src/app/activation/classify.js");

const COMMAND = {
  program: "C:\\Program Files\\nodejs\\node.exe",
  arguments: ["C:\\apps\\my app\\main.js"]
};
const USER = "S-1-5-21-1-2-3-1001";
const MINUTE = 60_000;
const FUTURE = new Date(2030, 4, 6, 7, 8, 9).getTime();

function xmlWith({ extra = [], periodInMinutes, isBatteryAllowed = true }: {
  extra?: readonly string[];
  periodInMinutes?: number;
  isBatteryAllowed?: boolean;
} = {}) {
  return alarmTaskXml({
    alarm: {
      name: "tick",
      firstTime: FUTURE,
      periodInMinutes
    },
    command: COMMAND,
    extra,
    isBatteryAllowed,
    description: "{\"a\":\"b\"}",
    userId: USER
  });
}

function createFakeBackend() {
  const tasks = new Map<string, string>();
  const backend = {
    userId: () => USER,
    create({ name, xml }) {
      tasks.set(name, xml);
    },
    read: name => tasks.get(name),
    list: () => [...tasks.keys()],
    remove: name => tasks.delete(name)
  } satisfies TaskBackend;
  return {
    backend,
    tasks
  };
}

test("a one-shot alarm is a time trigger that deletes itself a day later", () => {
  const xml = xmlWith();
  assert.match(xml, /<TimeTrigger><StartBoundary>2030-05-06T07:08:09<\/StartBoundary><EndBoundary>2030-05-07T07:08:09<\/EndBoundary>/u);
  assert.match(xml, /<DeleteExpiredTaskAfter>PT0S<\/DeleteExpiredTaskAfter>/u);
  assert.doesNotMatch(xml, /<Repetition>/u);
});

test("a periodic alarm repeats in hours, minutes and seconds", () => {
  assert.match(xmlWith({ periodInMinutes: 15 }), /<Interval>PT15M<\/Interval>/u);
  assert.match(xmlWith({ periodInMinutes: 90 }), /<Interval>PT1H30M<\/Interval>/u);
  assert.match(xmlWith({ periodInMinutes: 1.5 }), /<Interval>PT1M30S<\/Interval>/u);
  assert.doesNotMatch(xmlWith({ periodInMinutes: 15 }), /<EndBoundary>|<DeleteExpiredTaskAfter>/u);
});

test("the action quotes the program and the arguments, then escapes the XML", () => {
  const xml = xmlWith({ extra: ["--name", "a \"b\" & <c>", "C:\\dir\\"] });
  assert.match(xml, /<Command>&quot;C:\\Program Files\\nodejs\\node\.exe&quot;<\/Command>/u);
  assert.match(
    xml,
    /<Arguments>&quot;C:\\apps\\my app\\main\.js&quot; --winui-svelte-alarm=tick:\d+: --name &quot;a \\&quot;b\\&quot; &amp; &lt;c&gt;&quot; C:\\dir\\<\/Arguments>/u
  );
});

test("an argument with a control character is refused", () => {
  assert.throws(() => xmlWith({ extra: ["a\nb"] }), /control character/u);
});

test("a task runs as the user with normal rights, in parallel, with no time limit", () => {
  const xml = xmlWith();
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/u);
  assert.match(xml, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/u);
  assert.match(xml, /<MultipleInstancesPolicy>Parallel<\/MultipleInstancesPolicy>/u);
  assert.match(xml, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/u);
  assert.match(xmlWith({ isBatteryAllowed: false }), /<DisallowStartIfOnBatteries>true<\/DisallowStartIfOnBatteries>/u);
});

test("the marker argument round-trips and is taken off the arguments", () => {
  const argument = alarmArgument({
    name: "tick",
    firstTime: FUTURE,
    periodInMinutes: 5
  });
  assert.deepEqual(splitAlarmArgument(["a", argument, "b"]), {
    marker: {
      name: "tick",
      firstTime: FUTURE,
      periodInMinutes: 5
    },
    rest: ["a", "b"]
  });
  const once = splitAlarmArgument([alarmArgument({
    name: "tick",
    firstTime: FUTURE
  })]);
  assert.equal(once.marker?.periodInMinutes, undefined);
  assert.deepEqual(splitAlarmArgument(["--winui-svelte-alarm=bad name:1:"]).marker, undefined);
  assert.deepEqual(splitAlarmArgument(["--winui-svelte-alarm=x:nope:"]).marker, undefined);
});

test("an alarm activation carries the alarm, in a first start and in a redirect", async () => {
  const argument = alarmArgument({
    name: "tick",
    firstTime: FUTURE
  });
  for (const isRedirect of [false, true]) {
    const event = await classifyActivation({
      activation: {
        arguments: [argument, "--extra"],
        workingDirectory: "C:\\"
      },
      isRedirect
    });
    assert.equal(event.kind, "alarm");
    assert.deepEqual(event.arguments, ["--extra"]);
    assert.equal(event.kind === "alarm" ? event.alarm.name : "", "tick");
    assert.equal(event.kind === "alarm" ? event.alarm.scheduledTime : 0, FUTURE);
  }
});

test("occurrences follow the period from the first time", () => {
  const input = {
    firstTime: 1000 * MINUTE,
    periodInMinutes: 10,
    now: 1025 * MINUTE
  };
  assert.equal(nextOccurrence(input), 1030 * MINUTE);
  assert.equal(latestOccurrence(input), 1020 * MINUTE);
  assert.equal(
    nextOccurrence({
      ...input,
      now: 900 * MINUTE
    }), 1000 * MINUTE
  );
  assert.equal(
    latestOccurrence({
      ...input,
      now: 900 * MINUTE
    }), 1000 * MINUTE
  );
  assert.equal(
    nextOccurrence({
      ...input,
      periodInMinutes: undefined
    }), 1000 * MINUTE
  );
});

test("create registers the task under the package folder", async () => {
  const { backend, tasks } = createFakeBackend();
  await create("nightly-sync", {
    when: FUTURE,
    arguments: ["--sync"],
    command: COMMAND,
    backend
  });
  const xml = tasks.get("\\winui-svelte\\nightly-sync");
  assert.ok(xml?.includes("--sync"));
});

test("an alarm goes to a task and back: get and getAll read what create wrote", async () => {
  const { backend } = createFakeBackend();
  await create("once", {
    when: FUTURE,
    command: COMMAND,
    backend
  });
  await create("often", {
    when: FUTURE,
    periodInMinutes: 30,
    command: COMMAND,
    backend
  });
  assert.deepEqual(await get("once", { backend }), {
    name: "once",
    scheduledTime: FUTURE
  });
  assert.deepEqual(await get("often", { backend }), {
    name: "often",
    scheduledTime: FUTURE,
    periodInMinutes: 30
  });
  assert.equal(await get("missing", { backend }), undefined);
  assert.deepEqual((await getAll({ backend })).map(alarm => alarm.name), ["once", "often"]);
});

test("a periodic alarm that began in the past reports its next repeat", async () => {
  const { backend } = createFakeBackend();
  const first = Date.now() - 125 * MINUTE;
  await create("old", {
    when: first,
    periodInMinutes: 60,
    command: COMMAND,
    backend
  });
  const alarm = await get("old", { backend });
  assert.equal(alarm?.scheduledTime, first + 180 * MINUTE);
});

test("delayInMinutes counts from now, and a period alone is also the delay", async () => {
  const { backend } = createFakeBackend();
  const before = Date.now();
  await create("soon", {
    delayInMinutes: 0.5,
    command: COMMAND,
    backend
  });
  await create("later", {
    periodInMinutes: 10,
    command: COMMAND,
    backend
  });
  const soon = await get("soon", { backend });
  const later = await get("later", { backend });
  assert.ok((soon?.scheduledTime ?? 0) >= before + 30_000);
  assert.ok((later?.scheduledTime ?? 0) >= before + 10 * MINUTE);
});

test("fields that Chrome would refuse are refused before anything is made", async () => {
  const { backend, tasks } = createFakeBackend();
  const attempts = [
    {},
    {
      when: FUTURE,
      delayInMinutes: 1
    },
    {
      periodInMinutes: 0.5
    },
    {
      when: -1
    }
  ];
  for (const attempt of attempts) {
    await assert.rejects(
      create("bad", {
        ...attempt,
        command: COMMAND,
        backend
      }), /not a valid alarm/u
    );
  }

  await assert.rejects(
    create("..\\evil", {
      when: FUTURE,
      command: COMMAND,
      backend
    }), TypeError
  );
  assert.equal(tasks.size, 0);
});

test("clear and clearAll see only the package folder", async () => {
  const { backend } = createFakeBackend();
  for (const name of ["a", "b", "c"]) {
    await create(name, {
      when: FUTURE,
      command: COMMAND,
      backend
    });
  }

  assert.equal(await clear("a", { backend }), true);
  assert.equal(await clear("a", { backend }), false);
  assert.equal(await clearAll({ backend }), true);
  assert.equal(await clearAll({ backend }), false);
  assert.deepEqual(await getAll({ backend }), []);
});

test("onAlarm and onStartup call their listeners until they are removed", () => {
  const heard: string[] = [];
  function alarmListener(alarm: { name: string }) {
    heard.push(alarm.name);
  }

  function startupListener() {
    heard.push("startup");
  }

  onAlarm.addListener(alarmListener);
  onStartup.addListener(startupListener);
  assert.equal(onAlarm.hasListener(alarmListener), true);
  dispatchAlarm({
    name: "tick",
    scheduledTime: FUTURE
  });
  dispatchStartup();
  onAlarm.removeListener(alarmListener);
  onStartup.removeListener(startupListener);
  dispatchAlarm({
    name: "again",
    scheduledTime: FUTURE
  });
  dispatchStartup();
  assert.deepEqual(heard, ["tick", "startup"]);
  assert.equal(onAlarm.hasListener(alarmListener), false);
});
