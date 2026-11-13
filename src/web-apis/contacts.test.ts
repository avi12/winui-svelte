import assert from "node:assert/strict";
import { test } from "node:test";

// navigator.contacts over a stand-in chooser: argument validation, which
// properties come back, cancelling, the one-picker-at-a-time rule and the
// commit button extra. The real picker is a user interface and never opens
// in a test.

const { ContactsManager, installContacts } = await import("./contacts.ts");

type Chooser = NonNullable<Parameters<typeof installContacts>[0]>["chooser"];

const ADA = {
  names: ["Ada Lovelace"],
  emails: ["ada@example.com", "ada@work.example"],
  phones: ["+44 20 7946 0000"],
  addresses: [{
    addressLine: ["12 St James's Square"],
    city: "London",
    country: "GB",
    dependentLocality: "",
    organization: "",
    phone: "",
    postalCode: "SW1Y 4JH",
    recipient: "",
    region: "",
    sortingCode: ""
  }]
};

function fakeChooser({ picked = [ADA], isSupported = true }: {
  picked?: readonly typeof ADA[];
  isSupported?: boolean;
} = {}) {
  const choices: Parameters<NonNullable<Chooser>["choose"]>[0][] = [];
  let release: (() => void) | undefined;
  let isHeldOpen = false;
  const chooser = {
    properties: ["address", "email", "name", "tel"],
    isSupported: () => Promise.resolve(isSupported),
    async choose(choice) {
      choices.push(choice);
      await new Promise<void>(resolve => {
        release = resolve;
        const isImmediate = !isHeldOpen;
        if (isImmediate) {
          resolve();
        }
      });
      return picked;
    }
  } satisfies NonNullable<Chooser>;
  return {
    chooser,
    choices,
    hold() {
      isHeldOpen = true;
    },
    release() {
      release?.();
    }
  };
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  return undefined;
}

test("installs navigator.contacts and getProperties lists what the chooser can fill", async () => {
  const uninstall = installContacts({ chooser: fakeChooser().chooser });
  try {
    assert.ok(navigator.contacts instanceof ContactsManager);
    assert.deepEqual(await navigator.contacts.getProperties(), ["address", "email", "name", "tel"]);
  } finally {
    uninstall();
  }

  assert.equal("contacts" in navigator, false);
  assert.equal("ContactsManager" in globalThis, false);
});

test("select returns only the properties asked for, each a list", async () => {
  const fake = fakeChooser();
  const uninstall = installContacts({ chooser: fake.chooser });
  try {
    const contacts = await navigator.contacts.select(["name", "email", "icon"]);
    assert.deepEqual(contacts, [{
      name: ["Ada Lovelace"],
      email: ["ada@example.com", "ada@work.example"],
      icon: []
    }]);
    assert.deepEqual(fake.choices, [{
      properties: ["name", "email", "icon"],
      isMultiple: false,
      commitButtonText: undefined
    }]);

    const withAddress = await navigator.contacts.select(["address", "tel"], { multiple: true });
    assert.deepEqual(withAddress[0]?.tel, ["+44 20 7946 0000"]);
    assert.equal(withAddress[0]?.address?.[0]?.city, "London");
    assert.equal(fake.choices[1]?.isMultiple, true);
  } finally {
    uninstall();
  }
});

test("a cancelled picker resolves with an empty list", async () => {
  const uninstall = installContacts({ chooser: fakeChooser({ picked: [] }).chooser });
  try {
    assert.deepEqual(await navigator.contacts.select(["name"]), []);
  } finally {
    uninstall();
  }
});

test("no property or an unknown one is a TypeError", async () => {
  const uninstall = installContacts({ chooser: fakeChooser().chooser });
  try {
    assert.ok(await errorOf(navigator.contacts.select([])) instanceof TypeError);
    assert.ok(await errorOf(navigator.contacts.select(["name", "ssn"])) instanceof TypeError);
  } finally {
    uninstall();
  }
});

test("without a picker select rejects with NotSupportedError", async () => {
  const uninstall = installContacts({ chooser: fakeChooser({ isSupported: false }).chooser });
  try {
    const error = await errorOf(navigator.contacts.select(["name"]));
    assert.ok(error instanceof DOMException);
    assert.equal(error.name, "NotSupportedError");
  } finally {
    uninstall();
  }
});

test("a second select while a picker is open is an InvalidStateError, and the first still resolves", async () => {
  const fake = fakeChooser();
  fake.hold();
  const uninstall = installContacts({ chooser: fake.chooser });
  try {
    const first = navigator.contacts.select(["name"]);
    await new Promise(resolve => {
      setImmediate(resolve);
    });
    const error = await errorOf(navigator.contacts.select(["name"]));
    assert.ok(error instanceof DOMException);
    assert.equal(error.name, "InvalidStateError");
    fake.release();
    assert.deepEqual(await first, [{ name: ["Ada Lovelace"] }]);
    fake.hold();
    const next = navigator.contacts.select(["name"]);
    await new Promise(resolve => {
      setImmediate(resolve);
    });
    fake.release();
    assert.equal((await next).length, 1);
  } finally {
    uninstall();
  }
});

test("extra: commitButtonText reaches the chooser", async () => {
  const fake = fakeChooser();
  const uninstall = installContacts({ chooser: fake.chooser });
  try {
    await navigator.contacts.select(["name"], { commitButtonText: "Invite" });
    assert.equal(fake.choices[0]?.commitButtonText, "Invite");
  } finally {
    uninstall();
  }
});
