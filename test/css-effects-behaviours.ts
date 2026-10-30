import * as bindings from "#src/components/generated/bindings.js";
import { registerPropertyGroups, registerStyleSheet, styledElement } from "#src/css/index.js";
import { animationGroups } from "#src/css/translate/animation-properties.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { effectGroups } from "#src/css/translate/effect-properties.js";
import { translateStyleSheet } from "#src/css/translate/translate.js";
import { Window } from "#winui/microsoft/ui/xaml/Window";
import assert from "node:assert/strict";

// The CSS effects on a real WinUI: a keyframe animation begins a Storyboard on
// the element (its XAML loads, its target paths resolve, it begins), and the
// transform and shadow it needs are set and put back.

const SHEET = `
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@keyframes tint { from { background-color: #ff0000 } to { background-color: #0000ff } }
.fade { animation: fade 400ms ease-in-out 100ms 2 alternate both }
.spin { animation: spin 1s linear infinite }
.clipped { clip-path: inset(2px 4px) }
.tint { animation: tint 500ms steps(4, end) forwards }
`;
interface Checks {
  check(check: {
    name: string;
    action: () => void;
  }): void;
}

function sheet() {
  const translation = translateStyleSheet({
    file: "effects.svelte",
    css: SHEET,
    resources: loadWinuiCatalogue()
  });
  assert.deepEqual(translation.diagnostics.filter(diagnostic => diagnostic.severity === "error"), []);
  return translation.sheet;
}

function styled({ control, elementType, classNames }: {
  control: object;
  elementType: string;
  classNames: string;
}) {
  const element = styledElement({
    control,
    elementType,
    refreshText: () => undefined
  });
  element.setClasses(classNames);
  return element;
}

/** Registers the checks of the CSS effects with the mount test's runner. */
export function checkCssEffects({ check }: Checks) {
  const panel = new bindings.StackPanel();
  const window = new Window();
  window.content = panel;
  function hosted(control: bindings.Border) {
    panel.children.append(control);
    return control;
  }
  registerPropertyGroups([...animationGroups(), ...effectGroups()]);
  registerStyleSheet(sheet());

  check({
    name: "an opacity animation begins a Storyboard on the element",
    action() {
      const border = hosted(new bindings.Border());
      const element = styled({
        control: border,
        elementType: "border",
        classNames: "fade"
      });
      element.setClasses("");
      element.dispose();
    }
  });

  check({
    name: "a transform animation gives the element a RenderTransform and stops with the class",
    action() {
      const border = hosted(new bindings.Border());
      const element = styled({
        control: border,
        elementType: "border",
        classNames: "spin"
      });
      assert.ok(border.renderTransform !== null, "the animation gave no RenderTransform");
      element.setClasses("");
      element.dispose();
    }
  });

  check({
    name: "a color animation gives the element a brush of its own",
    action() {
      const border = hosted(new bindings.Border());
      const element = styled({
        control: border,
        elementType: "border",
        classNames: "tint"
      });
      assert.ok(border.background !== null, "the Background is not a brush of its own");
      element.dispose();
    }
  });

  check({
    name: "clip-path inset sets a Clip and removes it with the class",
    action() {
      const border = hosted(new bindings.Border());
      const element = styled({
        control: border,
        elementType: "border",
        classNames: "clipped"
      });
      assert.ok(border.clip !== null, "the element has no Clip");
      element.setClasses("");
      element.dispose();
    }
  });
}
