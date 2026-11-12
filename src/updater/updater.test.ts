import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const { createRelease, Updater, compareVersions, installedVersions } = await import("./index.ts");

const CURRENT = "1.0.0";
const NEXT = "1.2.0";

test("orders versions numerically", () => {
  assert.ok(
    compareVersions({
      left: "1.10.0",
      right: "1.9.0"
    }) > 0
  );
});

test("publishes, detects, stages and prunes a release", async () => {
  const work = await mkdtemp(path.join(tmpdir(), "updater-"));
  const app = path.join(work, "build");
  const host = path.join(work, "host");
  const root = path.join(work, "install");
  await mkdir(app, {
    recursive: true
  });
  await writeFile(path.join(app, "main.txt"), "new build");
  await createRelease({
    appDirectory: app,
    name: "demo",
    version: NEXT,
    outputDirectory: host
  });
  await mkdir(path.join(root, `app-${CURRENT}`), {
    recursive: true
  });
  const server = createServer((request, response) => {
    readFile(path.join(host, new URL(request.url ?? "/", "http://host").pathname))
      .then(body => response.end(body))
      .catch(() => {
        response.statusCode = 404;
        response.end();
      });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const isListening = typeof address === "object" && address !== null;
  const port = isListening ? address.port : 0;
  try {
    const updater = new Updater({
      root,
      feedUrl: `http://127.0.0.1:${port}/releases.json`,
      currentVersion: CURRENT,
      executable: "main.txt"
    });
    const release = await updater.update();
    assert.equal(release?.version, NEXT);
    assert.equal(await readFile(path.join(root, `app-${NEXT}`, "main.txt"), "utf8"), "new build");
    await updater.prune();
    assert.deepEqual(await installedVersions(root), [NEXT, CURRENT]);
  } finally {
    server.close();
    await rm(work, {
      recursive: true,
      force: true
    });
  }
});
