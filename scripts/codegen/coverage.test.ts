import { Coverage, inventory, matches } from "./coverage.ts";
import { knownGaps, notComponentPatterns, notComponents } from "./not-components.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LOCK_PATH = path.join(import.meta.dirname, "..", "..", ".winapp", "winmds.lock.json");
const HAS_METADATA = existsSync(LOCK_PATH);

test("every public class of WinUI is a component or says why not", { skip: !HAS_METADATA }, () => {
  const unclassified = inventory(LOCK_PATH).filter(entry => entry.coverage === Coverage.UNCLASSIFIED);
  assert.deepEqual(unclassified.map(entry => entry.name), []);
});

test("no entry of the not-a-component tables is dead", { skip: !HAS_METADATA }, () => {
  const names = inventory(LOCK_PATH).map(entry => entry.name);
  const known = new Set(names);
  const unknown = [...notComponents.keys(), ...knownGaps.keys()].filter(name => !known.has(name));
  assert.deepEqual(unknown, []);
  const unused = notComponentPatterns.filter(pattern => !names.some(name => matches({
    name,
    pattern
  })));
  assert.deepEqual(unused, []);
});

test("a class that became a component leaves the not-a-component table", { skip: !HAS_METADATA }, () => {
  const components = new Set(inventory(LOCK_PATH)
    .filter(entry => entry.coverage === Coverage.COMPONENT)
    .map(entry => entry.name));
  assert.deepEqual([...notComponents.keys(), ...knownGaps.keys()].filter(name => components.has(name)), []);
});

test("the counts of the inventory", { skip: !HAS_METADATA }, () => {
  const counts = Map.groupBy(inventory(LOCK_PATH), entry => entry.coverage);
  assert.ok((counts.get(Coverage.COMPONENT)?.length ?? 0) > 300);
  assert.equal(counts.get(Coverage.UNCLASSIFIED), undefined);
});
