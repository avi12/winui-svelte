import * as bindings from "#src/components/generated/bindings.js";
import { registerPropertyGroups, registerStyleSheet, styledElement } from "#src/css/index.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { compatGroups } from "#src/css/translate/compat-properties.js";
import { translateStyleSheet } from "#src/css/translate/translate.js";
import assert from "node:assert/strict";

// A prop is a local value, a rule (and `style`, and the directives that make
// it) is a Style setter: WinUI lets the local value win, and the rule fills in
// where the prop is absent.

const SHEET = ".text { user-select: text; padding: 7px } .stack { gap: 9px }";
const RULE_PADDING = 7;
const RULE_SPACING = 9;
const PROP_PADDING = 2;
const PROP_SPACING = 3;

interface Checks {
  check(check: {
    name: string;
    action: () => void;
  }): void;
}

function restyle({ control, elementType, className }: {
  control: object;
  elementType: string;
  className: string;
}) {
  styledElement({
    control,
    elementType,
    refreshText: () => undefined
  }).setClasses(className);
}

/** Registers the checks of "a prop overrides CSS" with the mount test's runner. */
export function checkCssPrecedence({ check }: Checks) {
  const translation = translateStyleSheet({
    file: "precedence.svelte",
    css: SHEET,
    resources: loadWinuiCatalogue()
  });
  assert.deepEqual(translation.diagnostics.filter(diagnostic => diagnostic.severity === "error"), []);
  registerPropertyGroups(compatGroups());
  registerStyleSheet(translation.sheet);

  check({
    name: "a prop beats the rule of the same property (TextBlock.isTextSelectionEnabled, padding)",
    action() {
      const withProps = new bindings.TextBlock();
      withProps.isTextSelectionEnabled = false;
      withProps.padding = {
        left: PROP_PADDING,
        top: PROP_PADDING,
        right: PROP_PADDING,
        bottom: PROP_PADDING
      };
      restyle({
        control: withProps,
        elementType: "text-block",
        className: "text"
      });
      assert.equal(withProps.isTextSelectionEnabled, false);
      assert.equal(withProps.padding.left, PROP_PADDING);

      const withoutProps = new bindings.TextBlock();
      restyle({
        control: withoutProps,
        elementType: "text-block",
        className: "text"
      });
      assert.equal(withoutProps.isTextSelectionEnabled, true);
      assert.equal(withoutProps.padding.left, RULE_PADDING);
    }
  });

  check({
    name: "a prop beats the rule of the same property (StackPanel.spacing, gap)",
    action() {
      const withProp = new bindings.StackPanel();
      withProp.spacing = PROP_SPACING;
      restyle({
        control: withProp,
        elementType: "stack-panel",
        className: "stack"
      });
      assert.equal(withProp.spacing, PROP_SPACING);

      const withoutProp = new bindings.StackPanel();
      restyle({
        control: withoutProp,
        elementType: "stack-panel",
        className: "stack"
      });
      assert.equal(withoutProp.spacing, RULE_SPACING);
    }
  });
}
