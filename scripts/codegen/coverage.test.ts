import { Coverage, inventory, matches } from "./coverage.ts";
import { knownGaps, notComponentPatterns, notComponents } from "./not-components.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LOCK_PATH = path.join(import.meta.dirname, "..", "..", ".winapp", "winmds.lock.json");
const INVENTORY_PATH = path.join(import.meta.dirname, "coverage.json");
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

test("the committed inventory matches the metadata", { skip: !HAS_METADATA }, () => {
  const entries = inventory(LOCK_PATH);
  const counts = Object.fromEntries(
    [...Map.groupBy(entries, entry => entry.coverage)]
      .map(([coverage, group]) => [coverage, group.length])
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
  );
  const listed = entries
    .filter(entry => entry.coverage === Coverage.KNOWN_GAP || entry.coverage === Coverage.NON_CONSTRUCTIBLE)
    .map(entry => ({
      name: entry.name,
      coverage: entry.coverage,
      reason: entry.reason
    }));
  const actual = `${JSON.stringify({
    counts,
    listed
  }, null, 2)}
`;
  const isUpdating = process.env["UPDATE_COVERAGE"] === "1";
  if (isUpdating) {
    writeFileSync(INVENTORY_PATH, actual);
  }

  assert.equal(readFileSync(INVENTORY_PATH, "utf8"), actual);
});
