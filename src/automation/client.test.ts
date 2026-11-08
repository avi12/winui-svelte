import type { UiaBackend, UiaChild, UiaHandle, UiaProperties } from "./backend.ts";
import { UiaElementUnavailableError } from "./backend.ts";
import { runUiaClient, UiaScopeEndedError, UiaWalkEnd } from "./client.ts";
import { UiaControlType } from "./ids.ts";
import { readWindowText, TextBlockKind } from "./text.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The client and the text reader over a fake tree: order, caps, pruning, the
// scope, and what a text pattern covers. The real calls are for
// native.test.ts.

interface FakeNode {
  readonly properties: Partial<UiaProperties>;
  readonly children?: readonly FakeNode[];
  readonly ranges?: readonly string[];
  readonly value?: string;
  readonly isGone?: boolean;
}

function propertiesOf(partial: Partial<UiaProperties>) {
  const properties: UiaProperties = {
    name: "",
    className: "",
    automationId: "",
    controlType: UiaControlType.pane,
    processId: 1,
    isOffscreen: false,
    boundingRectangle: {
      left: 0,
      top: 0,
      width: 10,
      height: 10
    },
    headingLevel: 0,
    hasTextPattern: false,
    hasValuePattern: false,
    ...partial
  };
  return properties;
}

function fakeBackend(root: FakeNode) {
  const nodes: FakeNode[] = [];
  const ranges: string[] = [];
  let isDisposed = false;

  function register(node: FakeNode) {
    nodes.push(node);
    return nodes.length - 1;
  }

  function nodeOf(handle: UiaHandle) {
    const node = nodes[handle];
    const isNodeUndefinedNodeIsGone = node === undefined || node.isGone;
    if (isNodeUndefinedNodeIsGone) {
      throw new UiaElementUnavailableError("gone");
    }

    return node;
  }

  const backend: UiaBackend = {
    elementFromHandle: () => register(root),
    focusedElement: () => null,
    properties: handle => propertiesOf(nodeOf(handle).properties),
    children(handle) {
      const children: UiaChild[] = [];
      for (const child of nodeOf(handle).children ?? []) {
        children.push({
          handle: register(child),
          properties: propertiesOf(child.properties)
        });
      }

      return children;
    },
    visibleRanges(handle) {
      const found = nodeOf(handle).ranges;
      const isFoundUndefined = found === undefined;
      if (isFoundUndefined) {
        return null;
      }

      return found.map(text => ranges.push(text) - 1);
    },
    documentRange: () => null,
    rangeText: ({ range, maxLength }) => (ranges[range] ?? "").slice(0, maxLength),
    value: handle => nodeOf(handle).value ?? null,
    dispose() {
      isDisposed = true;
    }
  };
  return {
    backend,
    get isDisposed() {
      return isDisposed;
    }
  };
}

function names(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    properties: {
      name: `item ${i}`
    }
  }));
}

test("a walk is breadth first and reports depth", async () => {
  const fake = fakeBackend({
    properties: {
      name: "root"
    },
    children: [
      {
        properties: {
          name: "a"
        },
        children: [{
          properties: {
            name: "a1"
          }
        }]
      },
      {
        properties: {
          name: "b"
        }
      }
    ]
  });
  const visited = await runUiaClient({
    backend: fake.backend,
    use(client) {
      const root = client.elementFromHandle(1n);
      assert.ok(root);
      return [...client.walk({ root })].map(node => `${node.depth}:${node.cached.name}`);
    }
  });
  assert.deepEqual(visited, ["1:a", "1:b", "2:a1"]);
  assert.ok(fake.isDisposed);
});

test("the element cap stops the walk and says so", async () => {
  const fake = fakeBackend({
    properties: {},
    children: names(50)
  });
  const result = await runUiaClient({
    backend: fake.backend,
    use(client) {
      const root = client.elementFromHandle(1n);
      assert.ok(root);
      const walk = client.walk({
        root,
        maxElements: 10
      });
      return {
        count: [...walk].length,
        end: walk.end
      };
    }
  });
  assert.deepEqual(result, {
    count: 10,
    end: UiaWalkEnd.maxElements
  });
});

test("the soft deadline stops the walk and keeps what it has", async () => {
  const fake = fakeBackend({
    properties: {},
    children: names(50)
  });
  const result = await runUiaClient({
    backend: fake.backend,
    use(client) {
      const root = client.elementFromHandle(1n);
      assert.ok(root);
      const walk = client.walk({
        root,
        maxMilliseconds: -1
      });
      return {
        count: [...walk].length,
        end: walk.end
      };
    }
  });
  assert.deepEqual(result, {
    count: 0,
    end: UiaWalkEnd.deadline
  });
});

test("shouldVisit false skips the element and its subtree", async () => {
  const fake = fakeBackend({
    properties: {},
    children: [
      {
        properties: {
          name: "chrome"
        },
        children: [{
          properties: {
            name: "inside"
          }
        }]
      },
      {
        properties: {
          name: "content"
        }
      }
    ]
  });
  const visited = await runUiaClient({
    backend: fake.backend,
    use(client) {
      const root = client.elementFromHandle(1n);
      assert.ok(root);
      return [...client.walk({
        root,
        shouldVisit: ({ name }) => name !== "chrome"
      })].map(node => node.cached.name);
    }
  });
  assert.deepEqual(visited, ["content"]);
});

test("an element that went away is skipped, not thrown", async () => {
  const fake = fakeBackend({
    properties: {},
    children: [
      {
        properties: {
          name: "gone"
        },
        isGone: true,
        children: [{
          properties: {
            name: "orphan"
          }
        }]
      },
      {
        properties: {
          name: "alive"
        }
      }
    ]
  });
  const visited = await runUiaClient({
    backend: fake.backend,
    use(client) {
      const root = client.elementFromHandle(1n);
      assert.ok(root);
      return [...client.walk({ root })].map(node => node.cached.name);
    }
  });
  assert.deepEqual(visited, ["gone", "alive"]);
});

test("an element refuses to work after its scope ended", async () => {
  const fake = fakeBackend({
    properties: {
      name: "root"
    }
  });
  const escaped = await runUiaClient({
    backend: fake.backend,
    use: client => client.elementFromHandle(1n)
  });
  assert.ok(escaped);
  assert.throws(() => escaped.properties(), UiaScopeEndedError);
});

test("a text pattern gives its visible ranges, cut to the length, and covers its subtree", async () => {
  const fake = fakeBackend({
    properties: {},
    children: [
      {
        properties: {
          controlType: UiaControlType.document,
          hasTextPattern: true
        },
        ranges: ["first line￼", "second line"],
        children: [{
          properties: {
            controlType: UiaControlType.text,
            name: "covered"
          }
        }]
      },
      {
        properties: {
          controlType: UiaControlType.edit,
          hasValuePattern: true
        },
        value: "typed"
      }
    ]
  });
  const blocks = await runUiaClient({
    backend: fake.backend,
    use(client) {
      const root = client.elementFromHandle(1n);
      assert.ok(root);
      return readWindowText({
        client,
        root
      }).blocks.map(block => block.text);
    }
  });
  assert.deepEqual(blocks, ["first line", "second line", "typed"]);

  const cut = await runUiaClient({
    backend: fakeBackend({
      properties: {},
      children: [{
        properties: {
          hasTextPattern: true
        },
        ranges: ["abcdefghij"]
      }]
    }).backend,
    use(client) {
      const root = client.elementFromHandle(1n);
      assert.ok(root);
      return readWindowText({
        client,
        root,
        maxCharacters: 4
      }).blocks.map(block => block.text);
    }
  });
  assert.deepEqual(cut, ["abcd"]);
});

test("headings, text and list items are blocks; chrome and off screen are not; the version follows the text", async () => {
  function tree(title: string) {
    return {
      properties: {
        name: title
      },
      children: [
        {
          properties: {
            controlType: UiaControlType.text,
            name: "Chapter",
            headingLevel: 2
          }
        },
        {
          properties: {
            controlType: UiaControlType.listItem,
            name: "an item"
          }
        },
        {
          properties: {
            controlType: UiaControlType.button,
            name: "Close"
          }
        },
        {
          properties: {
            controlType: UiaControlType.text,
            name: "hidden",
            isOffscreen: true
          }
        }
      ]
    };
  }

  function read(title: string) {
    return runUiaClient({
      backend: fakeBackend(tree(title)).backend,
      use(client) {
        const root = client.elementFromHandle(1n);
        assert.ok(root);
        return readWindowText({
          client,
          root
        });
      }
    });
  }

  const first = await read("one");
  assert.deepEqual(first.blocks, [
    {
      kind: TextBlockKind.heading,
      level: 2,
      text: "Chapter"
    },
    {
      kind: TextBlockKind.text,
      level: 0,
      text: "an item"
    }
  ]);
  assert.equal(first.title, "one");
  assert.equal(first.version.length, 16);
  assert.equal((await read("one")).version, first.version);
  assert.notEqual((await read("two")).version, first.version);
});
