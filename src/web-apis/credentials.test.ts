import assert from "node:assert/strict";
import type { KeyObject } from "node:crypto";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from "node:crypto";
import { test } from "node:test";

// navigator.credentials over stand-ins for the PasswordVault and Windows Hello:
// the Credential Management promise semantics, and the attestation and
// assertion bytes a relying party reads, checked with real RSA signatures.
// Real Windows Hello prompts are never shown by a test.

const {
  AuthenticatorAssertionResponse,
  AuthenticatorAttestationResponse,
  installCredentials,
  PasswordCredential,
  PublicKeyCredential
} = await import("./credentials.ts");
const { UserVerificationResult } = await import("./credentials-authenticator.ts");

type Backend = NonNullable<Parameters<typeof installCredentials>[0]>["backend"];

const ORIGIN = "https://login.example.com";
const RS256 = -257;

function fakeBackend({ isAvailable = true, verification = "verified" }: {
  isAvailable?: boolean;
  verification?: typeof UserVerificationResult[keyof typeof UserVerificationResult];
} = {}) {
  const entries = new Map<string, Map<string, string>>();
  const keys = new Map<string, {
    publicKey: KeyObject;
    privateKey: KeyObject;
  }>();
  const calls: string[] = [];
  const backend = {
    vault: {
      add({ resource, userName, password }) {
        const users = entries.get(resource) ?? new Map<string, string>();
        users.set(userName, password);
        entries.set(resource, users);
      },
      list(resource) {
        return [...entries.get(resource) ?? []].map(([userName, password]) => ({
          userName,
          password
        }));
      },
      remove({ resource, userName }) {
        entries.get(resource)?.delete(userName);
      }
    },
    keys: {
      isAvailable: () => Promise.resolve(isAvailable),
      createKey({ name }) {
        calls.push(`create ${name}`);
        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        keys.set(name, pair);
        return Promise.resolve(
          new Uint8Array(pair.publicKey.export({
            type: "spki",
            format: "der"
          }))
        );
      },
      sign({ name, data }) {
        calls.push(`sign ${name}`);
        const pair = keys.get(name);
        if (!pair) {
          return Promise.reject(new DOMException("no key", "NotAllowedError"));
        }

        return Promise.resolve(new Uint8Array(sign("sha256", data, pair.privateKey)));
      },
      deleteKey(name) {
        calls.push(`delete ${name}`);
        keys.delete(name);
        return Promise.resolve();
      },
      verifyUser(message) {
        calls.push(`verify ${message}`);
        return Promise.resolve(verification);
      }
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    entries,
    calls
  };
}

function withCredentials({ fake = fakeBackend(), options = {} }: {
  fake?: ReturnType<typeof fakeBackend>;
  options?: Omit<NonNullable<Parameters<typeof installCredentials>[0]>, "backend" | "origin">;
}) {
  return async (run: (container: typeof navigator.credentials) => Promise<void>) => {
    const uninstall = installCredentials({
      ...options,
      backend: fake.backend,
      origin: ORIGIN
    });
    try {
      await run(navigator.credentials);
    } finally {
      uninstall();
    }
  };
}

async function domRejection(promise: Promise<unknown>) {
  const error = await rejection(promise);
  assert.ok(error instanceof DOMException);
  return error;
}

async function nameOf(promise: Promise<unknown>) {
  return (await domRejection(promise)).name;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  return undefined;
}

function creationOptions(overrides: Partial<PublicKeyCredentialCreationOptions> = {}) {
  return {
    rp: {
      name: "Example"
    },
    user: {
      id: Uint8Array.of(1, 2, 3),
      name: "avi",
      displayName: "Avi"
    },
    challenge: Uint8Array.of(9, 8, 7),
    pubKeyCredParams: [{
      type: "public-key",
      alg: RS256
    }],
    ...overrides
  } satisfies PublicKeyCredentialCreationOptions;
}

function publicKeyOf(credential: unknown) {
  assert.ok(credential instanceof PublicKeyCredential);
  return credential;
}

function mapOf(value: unknown) {
  assert.ok(value instanceof Map);
  return value;
}

function bytesValueOf(value: unknown) {
  assert.ok(value instanceof Uint8Array);
  return value;
}

function attestationOf(credential: { readonly response: object }) {
  const { response } = credential;
  assert.ok(response instanceof AuthenticatorAttestationResponse);
  return response;
}

function assertionOf(credential: { readonly response: object }) {
  const { response } = credential;
  assert.ok(response instanceof AuthenticatorAssertionResponse);
  return response;
}

function bytesOf(buffer: ArrayBuffer) {
  return new Uint8Array(buffer);
}

interface Decoded {
  value: unknown;
  end: number;
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function decodeCbor({ bytes, start = 0 }: {
  bytes: Uint8Array;
  start?: number;
}): Decoded {
  const initial = bytes[start] ?? 0;
  const major = initial >> 5;
  const info = initial & 0x1f;
  let offset = start + 1;
  let length = info;
  const isOneByte = info === 24;
  if (isOneByte) {
    length = bytes[offset] ?? 0;
    offset += 1;
  } else if (info === 25) {
    length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    offset += 2;
  }

  const isUnsigned = major === 0;
  if (isUnsigned) {
    return {
      value: length,
      end: offset
    };
  }

  const isNegative = major === 1;
  if (isNegative) {
    return {
      value: -1 - length,
      end: offset
    };
  }

  const isString = major === 2 || major === 3;
  if (isString) {
    const slice = bytes.slice(offset, offset + length);
    return {
      value: major === 2 ? slice : Buffer.from(slice).toString("utf8"),
      end: offset + length
    };
  }

  const map = new Map<unknown, unknown>();
  for (let i = 0; i < length; i += 1) {
    const key = decodeCbor({
      bytes,
      start: offset
    });
    const value = decodeCbor({
      bytes,
      start: key.end
    });
    map.set(key.value, value.value);
    offset = value.end;
  }

  return {
    value: map,
    end: offset
  };
}

test("installs the globals and navigator.credentials, and uninstall removes them", () => {
  const uninstall = installCredentials({ backend: fakeBackend().backend });
  assert.equal(typeof navigator.credentials.get, "function");
  assert.equal(typeof globalThis.PublicKeyCredential, "function");
  uninstall();
  assert.equal("credentials" in navigator, false);
  assert.equal("PasswordCredential" in globalThis, false);
});

test("a password credential is stored, read back, and silent access follows preventSilentAccess", async () => {
  const fake = fakeBackend();
  await withCredentials({ fake })(async container => {
    const credential = await container.create({
      password: {
        id: "avi",
        password: "s3cret",
        name: "Avi"
      }
    });
    assert.ok(credential instanceof PasswordCredential);
    assert.equal(credential.type, "password");
    assert.equal(fake.entries.size, 0);

    await container.store(credential);
    assert.equal(fake.entries.get(ORIGIN)?.get("avi"), "s3cret");

    const silent = await container.get({
      password: true,
      mediation: "silent"
    });
    assert.ok(silent instanceof PasswordCredential);
    assert.equal(silent.id, "avi");
    assert.equal(silent.password, "s3cret");

    await container.preventSilentAccess();
    assert.equal(
      await container.get({
        password: true,
        mediation: "silent"
      }), null
    );
    const asked = await container.get({ password: true });
    assert.ok(asked instanceof PasswordCredential);
    const silentAgain = await container.get({
      password: true,
      mediation: "silent"
    });
    assert.ok(silentAgain instanceof PasswordCredential);
  });
});

test("get resolves null with nothing stored, with several accounts silently, and with no options", async () => {
  const fake = fakeBackend();
  await withCredentials({ fake })(async container => {
    assert.equal(await container.get({ password: true }), null);
    assert.equal(await container.get(), null);
    await container.store(
      new PasswordCredential({
        id: "one",
        password: "1"
      })
    );
    await container.store(
      new PasswordCredential({
        id: "two",
        password: "2"
      })
    );
    assert.equal(
      await container.get({
        password: true,
        mediation: "silent"
      }), null
    );
  });
});

test("several accounts go to the chooser; cancelling resolves null", async () => {
  const fake = fakeBackend();
  const offered: string[][] = [];
  let answer: string | undefined = "two";
  await withCredentials({
    fake,
    options: {
      chooseAccount(accounts) {
        offered.push(accounts.map(account => account.id));
        return Promise.resolve(answer);
      }
    }
  })(async container => {
    await container.store(
      new PasswordCredential({
        id: "one",
        password: "1"
      })
    );
    await container.store(
      new PasswordCredential({
        id: "two",
        password: "2"
      })
    );
    const chosen = await container.get({ password: true });
    assert.ok(chosen instanceof PasswordCredential);
    assert.equal(chosen.id, "two");
    assert.deepEqual(offered, [["one", "two"]]);
    answer = undefined;
    assert.equal(await container.get({ password: true }), null);
  });
});

test("store rejects what it cannot keep and create rejects what it cannot make", async () => {
  await withCredentials({})(async container => {
    const publicKey = await container.create({ publicKey: creationOptions() });
    assert.equal((await domRejection(container.store(publicKeyOf(publicKey)))).name, "NotSupportedError");
    assert.ok(
      await rejection(
        container.store({
          id: "x",
          type: "password"
        })
      ) instanceof TypeError
    );
    assert.equal((await domRejection(container.create({}))).name, "NotSupportedError");
    assert.ok(
      await rejection(
        container.create({
          // @ts-expect-error -- a password credential without a password is what is being rejected
          password: {
            id: "x"
          }
        })
      ) instanceof TypeError
    );
    assert.equal(
      (await domRejection(
        container.get({
          password: true,
          mediation: "conditional"
        })
      )).name, "NotSupportedError"
    );
  });
});

test("the registration response has the bytes a relying party reads", async () => {
  const fake = fakeBackend();
  await withCredentials({ fake })(async container => {
    const credential = await container.create({ publicKey: creationOptions() });
    assert.ok(credential instanceof PublicKeyCredential);
    assert.equal(credential.type, "public-key");
    assert.equal(credential.authenticatorAttachment, "platform");
    assert.deepEqual(credential.getClientExtensionResults(), {});
    assert.equal(Buffer.from(credential.rawId).toString("base64url"), credential.id);

    const response = attestationOf(credential);
    const clientData = JSON.parse(Buffer.from(response.clientDataJSON).toString("utf8"));
    assert.deepEqual(clientData, {
      type: "webauthn.create",
      challenge: Buffer.from([9, 8, 7]).toString("base64url"),
      origin: ORIGIN,
      crossOrigin: false
    });
    assert.deepEqual(response.getTransports(), ["internal"]);
    assert.equal(response.getPublicKeyAlgorithm(), RS256);

    const attestation = mapOf(decodeCbor({ bytes: bytesOf(response.attestationObject) }).value);
    assert.equal(attestation.get("fmt"), "none");
    assert.equal(mapOf(attestation.get("attStmt")).size, 0);
    const authenticatorData = bytesValueOf(attestation.get("authData"));
    assert.deepEqual(authenticatorData, bytesOf(response.getAuthenticatorData()));
    assert.deepEqual(
      authenticatorData.slice(0, 32),
      new Uint8Array(createHash("sha256").update("login.example.com").digest())
    );
    assert.equal(authenticatorData[32], 0x45);
    assert.deepEqual(authenticatorData.slice(33, 37), Uint8Array.of(0, 0, 0, 0));
    assert.equal(authenticatorData.slice(37, 53).every(byte => byte === 0), true);
    const idLength = ((authenticatorData[53] ?? 0) << 8) | (authenticatorData[54] ?? 0);
    assert.deepEqual(authenticatorData.slice(55, 55 + idLength), bytesOf(credential.rawId));

    const cose = mapOf(
      decodeCbor({
        bytes: authenticatorData,
        start: 55 + idLength
      }).value
    );
    const jwk = createPublicKey({
      key: Buffer.from(response.getPublicKey()),
      format: "der",
      type: "spki"
    }).export({ format: "jwk" });
    assert.equal(cose.get(1), 3);
    assert.equal(cose.get(3), RS256);
    assert.equal(Buffer.from(bytesValueOf(cose.get(-1))).toString("base64url"), jwk.n);
    assert.equal(Buffer.from(bytesValueOf(cose.get(-2))).toString("base64url"), jwk.e);
  });
});

test("the assertion verifies against the registered key, and the counter climbs", async () => {
  const fake = fakeBackend();
  await withCredentials({ fake })(async container => {
    const created = await container.create({ publicKey: creationOptions() });
    assert.ok(created instanceof PublicKeyCredential);
    const spki = Buffer.from(attestationOf(created).getPublicKey());

    const counters: number[] = [];
    for (const challenge of [Uint8Array.of(1), Uint8Array.of(2)]) {
      const assertion = await container.get({
        publicKey: {
          challenge,
          allowCredentials: [{
            type: "public-key",
            id: created.rawId
          }]
        }
      });
      assert.ok(assertion instanceof PublicKeyCredential);
      const response = assertionOf(assertion);
      assert.equal(assertion.id, created.id);
      assert.deepEqual(bytesOf(response.userHandle ?? new ArrayBuffer(0)), Uint8Array.of(1, 2, 3));
      const clientData = JSON.parse(Buffer.from(response.clientDataJSON).toString("utf8"));
      assert.equal(clientData.type, "webauthn.get");
      assert.equal(clientData.challenge, Buffer.from(challenge).toString("base64url"));
      const signed = Buffer.concat([
        Buffer.from(response.authenticatorData),
        createHash("sha256").update(Buffer.from(response.clientDataJSON)).digest()
      ]);
      const isValid = verify(
        "sha256", signed, createPublicKey({
          key: spki,
          format: "der",
          type: "spki"
        }), Buffer.from(response.signature)
      );
      assert.equal(isValid, true);
      const data = Buffer.from(response.authenticatorData);
      assert.equal(data[32], 0x05);
      counters.push(data.readUInt32BE(33));
    }

    assert.deepEqual(counters, [1, 2]);
  });
});

test("get without allowCredentials finds the discoverable credential, or asks", async () => {
  const fake = fakeBackend();
  await withCredentials({ fake })(async container => {
    const first = await container.create({ publicKey: creationOptions() });
    assert.ok(first instanceof PublicKeyCredential);
    const found = await container.get({
      publicKey: {
        challenge: Uint8Array.of(1)
      }
    });
    assert.ok(found instanceof PublicKeyCredential);
    assert.equal(found.id, first.id);
  });
  const two = fakeBackend();
  const offered: string[] = [];
  await withCredentials({
    fake: two,
    options: {
      chooseAccount(accounts) {
        offered.push(...accounts.map(account => account.name));
        return Promise.resolve(accounts[1]?.id);
      }
    }
  })(async container => {
    await container.create({ publicKey: creationOptions() });
    const second = await container.create({
      publicKey: creationOptions({
        user: {
          id: Uint8Array.of(4),
          name: "other",
          displayName: "Other"
        }
      })
    });
    assert.ok(second instanceof PublicKeyCredential);
    const found = await container.get({
      publicKey: {
        challenge: Uint8Array.of(1)
      }
    });
    assert.ok(found instanceof PublicKeyCredential);
    assert.equal(found.id, second.id);
    assert.deepEqual(offered.sort(), ["avi", "other"]);
  });
});

test("registration and sign-in reject with the spec's errors", async () => {
  const fake = fakeBackend();
  await withCredentials({ fake })(async container => {
    assert.equal(
      await nameOf(
        container.create({
          publicKey: creationOptions({
            pubKeyCredParams: [{
              type: "public-key",
              alg: -7
            }]
          })
        })
      ), "NotSupportedError"
    );
    assert.equal(
      await nameOf(
        container.create({
          publicKey: creationOptions({
            authenticatorSelection: {
              authenticatorAttachment: "cross-platform"
            }
          })
        })
      ), "NotSupportedError"
    );
    assert.equal(
      await nameOf(
        container.create({
          publicKey: creationOptions({
            rp: {
              id: "other.org",
              name: "Other"
            }
          })
        })
      ), "SecurityError"
    );
    assert.equal(
      await nameOf(
        container.get({
          publicKey: {
            challenge: Uint8Array.of(1),
            rpId: "other.org"
          }
        })
      ), "SecurityError"
    );
    assert.equal(
      await nameOf(
        container.get({
          publicKey: {
            challenge: Uint8Array.of(1)
          }
        })
      ), "NotAllowedError"
    );

    const created = await container.create({
      publicKey: creationOptions({
        rp: {
          id: "example.com",
          name: "Example"
        }
      })
    });
    assert.ok(created instanceof PublicKeyCredential);
    assert.equal(
      await nameOf(
        container.create({
          publicKey: creationOptions({
            rp: {
              id: "example.com",
              name: "Example"
            },
            excludeCredentials: [{
              type: "public-key",
              id: created.rawId
            }]
          })
        })
      ), "InvalidStateError"
    );
    assert.equal(
      await nameOf(
        container.get({
          publicKey: {
            challenge: Uint8Array.of(1),
            allowCredentials: [{
              type: "public-key",
              id: Uint8Array.of(0)
            }]
          }
        })
      ), "NotAllowedError"
    );

    const controller = new AbortController();
    controller.abort();
    assert.equal(
      await nameOf(
        container.create({
          publicKey: creationOptions(),
          signal: controller.signal
        })
      ), "AbortError"
    );
  });
});

test("an unset-up Windows Hello and an insecure origin are refused", async () => {
  await withCredentials({ fake: fakeBackend({ isAvailable: false }) })(async container => {
    assert.equal(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(), false);
    assert.equal(await PublicKeyCredential.isConditionalMediationAvailable(), false);
    assert.equal((await domRejection(container.create({ publicKey: creationOptions() }))).name, "NotAllowedError");
  });
  const uninstall = installCredentials({
    backend: fakeBackend().backend,
    origin: "http://example.com"
  });
  try {
    const error = await domRejection(navigator.credentials.create({ publicKey: creationOptions() }));
    assert.equal(error.name, "SecurityError");
  } finally {
    uninstall();
  }
});

test("a user who cancels Windows Hello makes the promise reject with NotAllowedError", async () => {
  const fake = fakeBackend();
  fake.backend.keys.createKey = () => Promise.reject(new DOMException("canceled", "NotAllowedError"));
  await withCredentials({ fake })(async container => {
    assert.equal((await domRejection(container.create({ publicKey: creationOptions() }))).name, "NotAllowedError");
    assert.equal(fake.entries.size, 0);
  });
});

test("extras: a verification message gates the request; verifyUser and deleteCredential", async () => {
  const refusing = fakeBackend({ verification: "canceled" });
  await withCredentials({ fake: refusing })(async container => {
    const error = await domRejection(
      container.create({
        publicKey: creationOptions(),
        userVerificationMessage: "Create your passkey"
      })
    );
    assert.equal(error.name, "NotAllowedError");
    assert.deepEqual(refusing.calls, ["verify Create your passkey"]);
    assert.equal(await PublicKeyCredential.verifyUser("Check"), "canceled");
  });

  const fake = fakeBackend();
  await withCredentials({ fake })(async container => {
    const created = await container.create({
      publicKey: creationOptions(),
      userVerificationMessage: "Create your passkey"
    });
    assert.ok(created instanceof PublicKeyCredential);
    assert.equal(fake.calls[0], "verify Create your passkey");
    assert.equal(await PublicKeyCredential.deleteCredential({ id: created.id }), true);
    assert.equal(await PublicKeyCredential.deleteCredential({ id: created.id }), false);
    assert.equal(fake.calls.some(call => call.startsWith("delete ")), true);
    assert.equal(
      (await domRejection(
        container.get({
          publicKey: {
            challenge: Uint8Array.of(1)
          }
        })
      )).name, "NotAllowedError"
    );
  });
});
