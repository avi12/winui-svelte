import { auditTree } from "./audit-tree.ts";
import type { ElementFacts } from "./audit-tree.ts";
import { parseRgba } from "./contrast.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

interface FakeElement {
  facts: ElementFacts | null;
  children: FakeElement[];
}

const BASE_FACTS: ElementFacts = {
  className: "Grid",
  controlType: "Group",
  name: "",
  automationId: "",
  hasLabeledBy: false,
  accessKey: "",
  isEnabled: true,
  isTabStop: false,
  isKeyboardFocusable: false,
  hasAccelerator: false,
  width: 100,
  height: 40,
  foreground: null,
  background: null,
  fontSize: 14,
  fontWeight: 400
};

function element({ facts = {}, children = [] }: {
  facts?: Partial<ElementFacts> | null;
  children?: FakeElement[];
}) {
  return {
    facts: facts === null ? null : {
      ...BASE_FACTS,
      ...facts
    },
    children
  };
}

function button(facts: Partial<ElementFacts> = {}) {
  return element({
    facts: {
      className: "Button",
      controlType: "Button",
      isTabStop: true,
      isKeyboardFocusable: true,
      ...facts
    }
  });
}

function input(facts: Partial<ElementFacts>) {
  return element({
    facts: {
      className: "TextBox",
      controlType: "Edit",
      isTabStop: true,
      ...facts
    }
  });
}

function text(facts: Partial<ElementFacts>) {
  return element({
    facts: {
      className: "TextBlock",
      controlType: "Text",
      foreground: color("#777777"),
      ...facts
    }
  });
}

function audit(...children: FakeElement[]) {
  return auditTree({
    root: element({ children }),
    host: {
      childrenOf: node => node.children,
      describe: node => node.facts
    }
  });
}

function ruleIds(...children: FakeElement[]) {
  return audit(...children).map(finding => finding.ruleId);
}

function color(css: string) {
  const parsed = parseRgba(css);
  assert.ok(parsed !== null);
  return parsed;
}

describe("auditTree", () => {
  test("an icon-only button with no name is found, a named one is not", () => {
    const findings = audit(button(), button({ name: "Save" }));
    assert.deepEqual(findings.map(finding => finding.ruleId), ["unnamed-button"]);
    assert.equal(findings[0]?.path, "Grid[0]/Button[0]");
    assert.match(findings[0]?.suggestion ?? "", /automationName/u);
  });

  test("an input needs a name or a labeling element", () => {
    assert.deepEqual(ruleIds(input({}), input({ hasLabeledBy: true }), input({ name: "Email" })), ["unlabeled-input"]);
  });

  test("two elements with the same access key are both found, whatever the case", () => {
    assert.deepEqual(
      ruleIds(
        button({
          name: "Save",
          accessKey: "S"
        }), button({
          name: "Send",
          accessKey: "s"
        }), button({
          name: "Open",
          accessKey: "O"
        })
      ),
      ["duplicate-access-key", "duplicate-access-key"]
    );
  });

  test("a focusable element with no size is found", () => {
    assert.deepEqual(
      ruleIds(
        button({
          name: "Hidden",
          width: 0
        })
      ), ["zero-size-focusable"]
    );
  });

  test("a control the keyboard cannot reach is found unless it has an access key or accelerator", () => {
    const off = {
      isTabStop: false,
      isKeyboardFocusable: false,
      name: "Go"
    };
    assert.deepEqual(
      ruleIds(
        button(off), button({
          ...off,
          accessKey: "G"
        }), button({
          ...off,
          hasAccelerator: true
        }), button({
          ...off,
          isEnabled: false
        })
      ),
      ["unreachable-by-keyboard"]
    );
  });

  test("text below AA on the nearest solid background is found, large text has the lower bar", () => {
    const surface = element({
      facts: {
        background: color("white")
      },
      children: [text({}), text({ foreground: color("#595959") }), text({ fontSize: 24 })]
    });
    const bad = element({
      facts: {
        background: color("#808080")
      },
      children: [text({ foreground: color("#999999") })]
    });
    assert.deepEqual(ruleIds(surface, bad), ["low-contrast-text", "low-contrast-text"]);
  });

  test("text with no resolvable solid background is left alone", () => {
    const pale = text({ foreground: color("#eeeeee") });
    const translucent = element({
      facts: {
        background: color("rgba(255, 255, 255, 0.5)")
      },
      children: [pale]
    });
    assert.deepEqual(ruleIds(pale, translucent), []);
  });

  test("a collapsed element and what is under it are skipped", () => {
    const collapsed = element({
      facts: null,
      children: [button()]
    });
    assert.deepEqual(ruleIds(collapsed), []);
  });
});
