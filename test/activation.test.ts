import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The activation example (examples/activation) in real windows, off screen: a
// second copy started with a `note:` link, and one started with a `.note`
// file, each exit on their own and reach the first copy as one typed event.
// Nothing is registered with Windows here (the registry has its own test in
// src/app/activation/native.test.ts) and no input is sent. Skipped where the
// Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ENTRY = "examples/activation/main.ts";

const eventsSchema = z.array(
  z.object({
    kind: z.string(),
    isRedirect: z.boolean(),
    detail: z.string()
  })
);

function eventsOf(report: Report) {
  return eventsSchema.parse(report["events"]);
}

async function startFirst(flags: string[]) {
  const first = ExampleProcess.start({
    entry: ENTRY,
    flags
  });
  const stats = await first.settled({
    command: {
      cmd: "stats"
    },
    kind: "stats"
  });
  assert.equal(stats["isPrimary"], true);
  return first;
}

test("a second copy started with a link or a file reaches the first as typed events", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "activation-"));
  const notePath = path.join(folder, "todo.note");
  const textPath = path.join(folder, "other.txt");
  writeFileSync(notePath, "a note");
  writeFileSync(textPath, "not a note");
  const flags = ["--key", `dev.winui-svelte.test.${randomUUID()}`];
  const copies: ExampleProcess[] = [];
  try {
    const first = await startFirst(flags);
    copies.push(first);
    for (const argument of ["note:open?id=1", notePath, textPath]) {
      const second = ExampleProcess.start({
        entry: ENTRY,
        flags: [...flags, argument]
      });
      copies.push(second);
      assert.equal(await second.exited, 0, "the second copy exits on its own");
    }

    const heard = await first.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const events = eventsOf(heard);
    assert.deepEqual(events.map(event => [event.kind, event.isRedirect]), [
      ["launch", false],
      ["protocol", true],
      ["file", true],
      ["redirect", true]
    ]);
    assert.equal(events[1]?.detail, "note:open?id=1");
    assert.equal(events[2]?.detail, notePath);

    first.send({ cmd: "close" });
    assert.equal(await first.exited, 0);
  } finally {
    for (const copy of copies) {
      copy.kill();
    }

    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
});
