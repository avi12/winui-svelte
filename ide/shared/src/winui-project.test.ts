import { dependsOnLibrary, isWinuiFile, projectRootOf } from "./winui-project.ts";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const UNRELATED = '{"dependencies":{"svelte":"^5"}}';
const root = await mkdtemp(path.join(tmpdir(), "winui-project-"));
after(() =>
  rm(root, {
    recursive: true,
    force: true
  })
);

test("a dependency counts, whichever of the four tables lists it", () => {
  for (const table of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    assert.equal(
      dependsOnLibrary(
        JSON.stringify({
          [table]: {
            "winui-svelte": "^0.0.3"
          }
        })
      ),
      true,
      table
    );
  }
});

test("a linked, file or workspace specifier counts", () => {
  for (const specifier of ["link:../winui-svelte", "file:../winui-svelte", "workspace:*"]) {
    assert.equal(
      dependsOnLibrary(
        JSON.stringify({
          dependencies: {
            "winui-svelte": specifier
          }
        })
      ),
      true,
      specifier
    );
  }
});

test("another package or none does not count", () => {
  assert.equal(dependsOnLibrary(UNRELATED), false);
  assert.equal(dependsOnLibrary('{"name":"winui-svelte"}'), false);
  assert.equal(dependsOnLibrary('{"scripts":{"winui-svelte":"x"}}'), false);
  assert.equal(dependsOnLibrary("{}"), false);
});

test("text that is not an object does not count", () => {
  for (const text of ["not json", "[1]", "", "null"]) {
    assert.equal(dependsOnLibrary(text), false, text);
  }
});

test("a file belongs to the nearest package.json above it, and a broken one is not a dependency", async () => {
  const app = path.join(root, "app");
  const broken = path.join(root, "broken");
  await mkdir(path.join(app, "src"), { recursive: true });
  await mkdir(broken);
  await writeFile(path.join(app, "package.json"), '{"devDependencies":{"winui-svelte":"*"}}');
  await writeFile(path.join(broken, "package.json"), "{ nope");
  assert.equal(await isWinuiFile(path.join(app, "src", "A.svelte")), true);
  assert.equal(await isWinuiFile(path.join(broken, "A.svelte")), false);
  assert.equal(await projectRootOf(path.join(app, "src", "A.svelte")), app);
});
