import { classifyActivation } from "./classify.ts";
import { ActivationKind } from "./kinds.ts";
import { packagedActivation, withPackagedActivation } from "./packaged.ts";
import { STARTUP_ARGUMENT } from "./registration.ts";
import { ExtendedActivationKind } from "#winui/microsoft/windows/app-lifecycle/ExtendedActivationKind";
import assert from "node:assert/strict";
import { test } from "node:test";

// The Windows App SDK's activation of a packaged start, read from an injected
// AppActivationArguments source: the address of a protocol activation, a
// startup task, nothing outside a package or for a malformed payload, and how
// it merges with the command line.

const URI = "geminilive-key://?state=HoldStart&x=1";

function protocolSource(data: unknown) {
  return () => ({
    kind: ExtendedActivationKind.Protocol,
    data
  });
}

test("a protocol activation gives its address", () => {
  const packaged = packagedActivation({
    read: protocolSource({
      uri: {
        rawUri: URI
      }
    })
  });
  assert.deepEqual(packaged, {
    kind: ActivationKind.protocol,
    uri: URI
  });
});

test("a startup task is detected, whatever its data", () => {
  const packaged = packagedActivation({
    read: () => ({
      kind: ExtendedActivationKind.StartupTask,
      data: null
    })
  });
  assert.deepEqual(packaged, { kind: ActivationKind.startup });
});

test("outside a package, for a plain launch and for another kind there is nothing", () => {
  assert.equal(packagedActivation({ read: () => undefined }), undefined);
  assert.equal(
    packagedActivation({
      read: () => ({
        kind: ExtendedActivationKind.Launch,
        data: null
      })
    }), undefined
  );
  assert.equal(
    packagedActivation({
      read: () => ({
        kind: ExtendedActivationKind.File,
        data: {
          uri: {
            rawUri: URI
          }
        }
      })
    }), undefined
  );
});

test("a malformed payload is ignored and a failing source never throws", () => {
  for (const data of [null, "x", {}, { uri: "x" }, {
    uri: {
      rawUri: 1
    }
  }]) {
    assert.equal(packagedActivation({ read: protocolSource(data) }), undefined);
  }

  assert.equal(
    packagedActivation({
      read() {
        throw new Error("no identity");
      }
    }), undefined
  );
});

test("the packaged address is added to the command line, the command line's own address wins", async () => {
  const packaged = packagedActivation({
    read: protocolSource({
      uri: {
        rawUri: URI
      }
    })
  });
  const own = "other-app:first";
  const merged = withPackagedActivation({
    values: [own],
    packaged
  });
  const event = await classifyActivation({
    activation: {
      arguments: [...merged],
      workingDirectory: "."
    },
    isRedirect: false
  });
  assert.equal(event.kind, ActivationKind.protocol);
  assert.equal(event.kind === ActivationKind.protocol && event.uri, own);
  const alone = await classifyActivation({
    activation: {
      arguments: [...withPackagedActivation({
        values: [],
        packaged
      })],
      workingDirectory: "."
    },
    isRedirect: false
  });
  assert.equal(alone.kind === ActivationKind.protocol && alone.uri, URI);
});

test("an address already on the command line is not added twice", () => {
  const packaged = {
    kind: ActivationKind.protocol,
    uri: URI
  } as const;
  assert.deepEqual(
    withPackagedActivation({
      values: [URI],
      packaged
    }), [URI]
  );
});

test("a startup task becomes the startup marker, and nothing changes outside a package", async () => {
  const merged = withPackagedActivation({
    values: ["--tray"],
    packaged: {
      kind: ActivationKind.startup
    }
  });
  assert.deepEqual(merged, ["--tray", STARTUP_ARGUMENT]);
  const event = await classifyActivation({
    activation: {
      arguments: [...merged],
      workingDirectory: "."
    },
    isRedirect: false
  });
  assert.equal(event.kind, ActivationKind.startup);
  assert.deepEqual(
    withPackagedActivation({
      values: ["a"],
      packaged: undefined
    }), ["a"]
  );
});
