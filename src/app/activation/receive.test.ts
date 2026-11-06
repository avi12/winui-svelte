import type { ActivationEvent } from "./kinds.ts";
import type { Activation } from "#src/app/redirect.js";
import type { SingleInstanceOptions } from "#src/app/single-instance.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// One typed event for every way the app is started: the classification of a
// command line over a temporary folder, and the delivery of the first start
// and of redirects through a stand-in for the single-instance link.

const { ActivationKind } = await import("./kinds.ts");
const { classifyActivation } = await import("./classify.ts");
const { startActivation } = await import("./receive.ts");
const { STARTUP_ARGUMENT } = await import("./registration.ts");

const FOLDER = mkdtempSync(path.join(tmpdir(), "activation-"));
const NOTE = path.join(FOLDER, "todo.NOTE");
const TEXT = path.join(FOLDER, "readme.txt");
writeFileSync(NOTE, "a");
writeFileSync(TEXT, "b");

test.after(() => {
  rmSync(FOLDER, {
    recursive: true,
    force: true
  });
});

function classify({ values, isRedirect = false, extensions }: {
  values: string[];
  isRedirect?: boolean;
  extensions?: Set<string>;
}) {
  return classifyActivation({
    activation: {
      arguments: values,
      workingDirectory: FOLDER
    },
    isRedirect,
    ...extensions === undefined ? {} : { extensions }
  });
}

test("a link of a scheme is a protocol activation, whatever else came with it", async () => {
  const event = await classify({ values: [NOTE, "Note:open?id=1"] });
  assert.equal(event.kind, ActivationKind.protocol);
  assert.deepEqual(event.kind === ActivationKind.protocol && [event.uri, event.scheme], ["Note:open?id=1", "note"]);
});

test("existing files are a file activation, resolved against the working directory", async () => {
  const event = await classify({ values: ["todo.NOTE", "missing.note", "readme.txt"] });
  assert.equal(event.kind, ActivationKind.file);
  assert.deepEqual(event.kind === ActivationKind.file && event.files, [NOTE, TEXT]);
});

test("the extensions filter keeps other files out", async () => {
  const event = await classify({
    values: [TEXT, NOTE],
    extensions: new Set([".note"])
  });
  assert.deepEqual(event.kind === ActivationKind.file && event.files, [NOTE]);
});

test("the startup marker makes a startup activation and is not an argument", async () => {
  const event = await classify({ values: [STARTUP_ARGUMENT, "--tray"] });
  assert.equal(event.kind, ActivationKind.startup);
  assert.deepEqual(event.arguments, ["--tray"]);
});

test("nothing to open is a launch, or a redirect from a later copy", async () => {
  assert.equal((await classify({ values: ["--flag"] })).kind, ActivationKind.launch);
  const redirect = await classify({
    values: ["--flag"],
    isRedirect: true
  });
  assert.equal(redirect.kind, ActivationKind.redirect);
  assert.equal(redirect.isRedirect, true);
});

test("a reserved scheme, a drive letter and a link with a control character are plain arguments", async () => {
  for (const value of ["https://example.com", "C:\\x", "note:a\nb", "javascript:alert(1)"]) {
    assert.equal((await classify({ values: [value] })).kind, ActivationKind.launch, value);
  }
});

test("arguments that are too many, too long or hold a NUL are rejected by the schema", async () => {
  await assert.rejects(classify({ values: ["a\u0000b"] }));
  await assert.rejects(classify({ values: ["x".repeat(40_000)] }));
  await assert.rejects(classify({ values: Array.from({ length: 2000 }, () => "a") }));
});

function ignoreRedirect() {}

function fakeLink() {
  let onRedirect: SingleInstanceOptions["onRedirect"] = ignoreRedirect;
  return {
    send(activation: Activation) {
      onRedirect(activation);
    },
    claim(options: SingleInstanceOptions) {
      onRedirect = options.onRedirect;
      return {
        isPrimary: true,
        release() {}
      };
    }
  };
}

test("the first start and every redirect arrive in order as events, and redirects also reach the launch queue", async () => {
  const link = fakeLink();
  const events: ActivationEvent[] = [];
  const queued: Activation[] = [];
  const errors: unknown[] = [];
  startActivation({
    key: "test",
    claim: link.claim,
    initialArguments: ["note:first"],
    launchQueue: {
      enqueueActivation: activation => queued.push(activation)
    },
    onActivation: event => events.push(event),
    onError: error => errors.push(error)
  });
  link.send({
    arguments: [NOTE],
    workingDirectory: FOLDER
  });
  link.send({
    arguments: ["note:second"],
    workingDirectory: FOLDER
  });
  link.send({
    arguments: ["a\u0000b"],
    workingDirectory: FOLDER
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(events.map(event => [event.kind, event.isRedirect]), [
    [ActivationKind.protocol, false],
    [ActivationKind.file, true],
    [ActivationKind.protocol, true]
  ]);
  assert.equal(queued.length, 2, "the launch queue gets the two redirects that were valid");
  assert.equal(errors.length, 1, "the invalid arguments are reported and the next events still arrive");
});

test("a copy that is not the first delivers nothing", async () => {
  const events: ActivationEvent[] = [];
  const single = startActivation({
    key: "test",
    claim: () => ({
      isPrimary: false,
      release() {}
    }),
    initialArguments: ["note:x"],
    onActivation: event => events.push(event)
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(single.isPrimary, false);
  assert.deepEqual(events, []);
});
