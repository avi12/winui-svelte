import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// Real DPAPI calls, no window. The .NET cases seal and unseal through
// powershell.exe at test time, because a blob is bound to the user who made it.

const IS_WINDOWS = process.platform === "win32";
const { DynComRawMemory } = await import("@microsoft/dynwinrt/com/unsafe/raw");
const { createDataProtection, REAL_NATIVE } = await import("./native.ts");
const { DataProtectionError, MAX_DATA_BYTES, ProtectionScope, protectData, unprotectData, wipe } = await import("./index.ts");

const PLAIN_TEXT = "winui-svelte dpapi test";
const ONE_MEBIBYTE = 1024 * 1024;
const ERROR_INVALID_PARAMETER = 87;
const POWERSHELL_TIMEOUT_MILLISECONDS = 60_000;
const SCOPES = [ProtectionScope.CURRENT_USER, ProtectionScope.LOCAL_MACHINE];
const ENTROPIES = [undefined, Buffer.from("salt")];

function patterned(length: number) {
  return Uint8Array.from({ length }, (_, i) => i % 251 + 1);
}

function powershell(script: string) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    timeout: POWERSHELL_TIMEOUT_MILLISECONDS
  });
  assert.equal(result.status, 0, "powershell failed");
  return result.stdout.trim();
}

for (const scope of SCOPES) {
  for (const entropy of ENTROPIES) {
    for (const length of [0, 23, ONE_MEBIBYTE]) {
      test(`round trip of ${length} bytes, scope ${scope}, ${entropy === undefined ? "no" : "with"} entropy`, {
        skip: !IS_WINDOWS
      }, () => {
        const data = patterned(length);
        const sealed = protectData({
          data,
          scope,
          ...entropy === undefined ? {} : { entropy },
          description: "test"
        });
        assert.notDeepEqual(sealed, data);
        const plain = unprotectData({
          data: sealed,
          ...entropy === undefined ? {} : { entropy }
        });
        assert.deepEqual(plain, data);
      });
    }
  }
}

test("the wrong entropy or a corrupted blob fails with DataProtectionError", { skip: !IS_WINDOWS }, () => {
  const sealed = protectData({
    data: patterned(32),
    entropy: Buffer.from("right")
  });
  assert.throws(() => unprotectData({
    data: sealed,
    entropy: Buffer.from("wrong")
  }), DataProtectionError);
  assert.throws(() => unprotectData({ data: sealed }), DataProtectionError);

  const corrupted = Uint8Array.from(sealed);
  corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xFF;
  assert.throws(() => unprotectData({
    data: corrupted,
    entropy: Buffer.from("right")
  }), DataProtectionError);

  const error = (() => {
    try {
      unprotectData({ data: Buffer.from("not a blob") });
    } catch (thrown) {
      return thrown;
    }
    return undefined;
  })();
  assert.ok(error instanceof DataProtectionError);
  assert.equal(error.code, ERROR_INVALID_PARAMETER);
  assert.doesNotMatch(error.message, /not a blob/u);
});

test("data over the limit is rejected before anything is allocated", { skip: !IS_WINDOWS }, () => {
  assert.throws(() => protectData({ data: new Uint8Array(MAX_DATA_BYTES + 1) }), RangeError);
});

test("wipe zeroes a buffer", () => {
  const buffer = patterned(8);
  wipe(buffer);
  assert.deepEqual(buffer, new Uint8Array(8));
});

test("every native buffer that held plain text is zero when it is released", { skip: !IS_WINDOWS }, () => {
  const released: boolean[] = [];
  const freed: boolean[] = [];
  const plain = Buffer.from(PLAIN_TEXT);
  const { protect, unprotect } = createDataProtection({
    allocate({ size, alignment }) {
      const memory = DynComRawMemory.allocate(size, alignment);
      const original = memory.release.bind(memory);
      memory.release = () => {
        released.push(memory.readBytes(0, Number(memory.size)).every(byte => byte === 0));
        original();
      };
      return memory;
    },
    localFree({ address, size }) {
      const view = DynComRawMemory.fromUnsafeAddress(address, size, 1);
      freed.push(view.readBytes(0, size).every(byte => byte === 0));
      REAL_NATIVE.localFree({
        address,
        size
      });
    }
  });
  const sealed = protect({
    data: plain,
    entropy: Buffer.from("salt")
  });
  const opened = unprotect({
    data: sealed,
    entropy: Buffer.from("salt")
  });
  assert.equal(Buffer.from(opened).toString(), PLAIN_TEXT);
  assert.ok(released.length > 0);
  assert.ok(released.every(Boolean), "an allocated buffer was released holding bytes");
  assert.deepEqual(freed, [true, true]);
});

test("a blob .NET ProtectedData made unseals here", { skip: !IS_WINDOWS }, () => {
  const base64 = powershell(
    `Add-Type -AssemblyName System.Security
[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes('${PLAIN_TEXT}'), $null, 'CurrentUser'))`
  );
  const plain = unprotectData({ data: Buffer.from(base64, "base64") });
  assert.equal(Buffer.from(plain).toString("utf8"), PLAIN_TEXT);
});

test("a blob made here unseals in .NET ProtectedData", { skip: !IS_WINDOWS }, () => {
  const sealed = protectData({
    data: Buffer.from(PLAIN_TEXT),
    entropy: Buffer.from("salt")
  });
  const text = powershell(
    `Add-Type -AssemblyName System.Security
$blob = [Convert]::FromBase64String('${Buffer.from(sealed).toString("base64")}')
[Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect($blob, [Text.Encoding]::UTF8.GetBytes('salt'), 'CurrentUser'))`
  );
  assert.equal(text, PLAIN_TEXT);
});
