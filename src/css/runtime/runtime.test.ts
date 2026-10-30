import { hasStyle } from "./resources.ts";
import type { CssNative } from "./runtime.ts";
import {
  installCssRuntime,
  registerPropertyGroups,
  registerStyleSheet,
  styledElement as styledElementOf,
  styleOfClasses,
  unregisterStyleSheet
} from "./runtime.ts";
import { textTransforms } from "./text-transforms.ts";
import { animationGroups } from "#src/css/translate/animation-properties.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { compatGroups } from "#src/css/translate/compat-properties.js";
import { containerGroups } from "#src/css/translate/container-properties.js";
import { effectGroups } from "#src/css/translate/effect-properties.js";
import { focusGroups } from "#src/css/translate/focus-properties.js";
import { queryGroups } from "#src/css/translate/query-properties.js";
import { resourceGroups } from "#src/css/translate/resource-properties.js";
import { transformGroups } from "#src/css/translate/transform-properties.js";
import { translateStyleSheet } from "#src/css/translate/translate.js";
import type { NativeValue } from "#src/native-value.js";
import { read } from "#src/renderer/host/reflect.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The runtime against a fake WinUI: a "dictionary" is its XAML, a "style" is
// the XAML of the dictionary it was looked up in.

queryGroups();

const resources = loadWinuiCatalogue();

interface FakeControl {
  style: string | null;
  styleChanges: number;
  columns: string | null;
  assigned: Record<string, unknown>;
  composed: Record<string, string>;
  resources: string[];
  handlers: Map<string, () => void>;
  properties: Record<string, NativeValue>;
  animations: string[];
  brushes: string[];
}

function control(properties: Record<string, NativeValue> = {}) {
  return {
    style: null,
    styleChanges: 0,
    columns: null,
    assigned: {},
    composed: {},
    resources: [],
    handlers: new Map(),
    properties,
    animations: [],
    brushes: []
  };
}

function isFakeControl(value: object): value is FakeControl {
  return "handlers" in value;
}

function fake(target: object) {
  if (!isFakeControl(target)) {
    throw new TypeError("not a fake control");
  }

  return target;
}

function styledElement({ control, elementType, refreshText = () => undefined }: {
  control: object;
  elementType: string;
  refreshText?: () => void;
}) {
  return styledElementOf({
    control,
    elementType,
    refreshText
  });
}

const mergedResources: string[] = [];
const fakeNative: CssNative = {
  loadDictionary: xaml => ({ xaml }),
  mergeIntoApplication(dictionary) {
    mergedResources.push(String(read(dictionary, "xaml")));
  },
  mergeIntoControl(target, dictionary) {
    const { resources } = fake(target);
    const xaml = String(read(dictionary, "xaml"));
    resources.push(xaml);
    return () => resources.splice(resources.indexOf(xaml), 1);
  },
  lookupStyle: dictionary => dictionary,
  hasApplicationResource: key => hasStyle({
    catalogue: resources,
    key
  }),
  setStyle(target, style) {
    const fakeControl = fake(target);
    fakeControl.style = style === null ? null : String(read(style, "xaml"));
    fakeControl.styleChanges++;
  },
  viewportOf(target) {
    const { width, height } = fake(target).properties;
    const isSized = typeof width === "number" && typeof height === "number";
    return isSized ? {
      width,
      height
    } : null;
  },
  watchViewport(target, handler) {
    const fakeControl = fake(target);
    fakeControl.handlers.set("viewport", handler);
    return () => fakeControl.handlers.delete("viewport");
  },
  setGridDefinitions(target, kind, lengths) {
    fake(target).columns = `${kind}:${lengths}`;
  },
  setComposition({ control, property, value }) {
    fake(control).composed[property] = value;
    return () => delete fake(control).composed[property];
  },
  assign(target, values) {
    Object.assign(fake(target).assigned, values);
  },
  subscribe(target, event, handler) {
    const fakeControl = fake(target);
    fakeControl.handlers.set(event, handler);
    return () => fakeControl.handlers.delete(event);
  },
  read: ({ control, property }) => fake(control).properties[property],
  clip({ control, rect }) {
    fake(control).assigned["clip"] = rect;
  },
  animate({ control, storyboards, hasTransform, brushes }) {
    const { animations, brushes: animatedBrushes } = fake(control);
    animatedBrushes.push(...brushes.map(({ property, color }) => `${property}:${color}`));
    animations.push(...storyboards.map(({ xaml, isPaused }) => `${isPaused ? "paused " : ""}${hasTransform ? "transform " : ""}${xaml}`));
    return () => {
      animations.splice(0);
      animatedBrushes.splice(0);
    };
  }
};

function sheet({ id, css }: {
  id: string;
  css: string;
}) {
  const translation = translateStyleSheet({
    file: id,
    css,
    resources
  });
  assert.deepEqual(translation.diagnostics, []);
  return translation.sheet;
}

// Sheets registered before the runtime is installed are merged by installing it.
registerStyleSheet(
  sheet({
    id: "early.svelte",
    css: ":root { --accent: #0af }\n.early { opacity: 0.5 }"
  })
);
installCssRuntime(fakeNative);

test("a sheet registered before install has its custom properties merged at install", () => {
  assert.equal(mergedResources.length, 1);
  assert.match(mergedResources[0] ?? "", /<Color x:Key="Accent">#00AAFF<\/Color>/u);
});

test("classes become a Style, and a class toggled off removes it", () => {
  registerStyleSheet(
    sheet({
      id: "card.svelte",
      css: ".card.svelte-1 { padding: 12px 16px }\n.on.svelte-1 { opacity: 0.5 }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("card svelte-1");
  assert.match(target.style ?? "", /TargetType="Border"/u);
  assert.match(target.style ?? "", /<Setter Property="Padding" Value="16,12,16,12"\/>/u);
  assert.doesNotMatch(target.style ?? "", /Opacity/u);

  element.setClasses("card svelte-1 on");
  assert.match(target.style ?? "", /<Setter Property="Opacity" Value="0.5"\/>/u);

  element.setClasses("");
  assert.equal(target.style, null);
  element.dispose();
});

test("a Style with no base builds on the control's default style, where WinUI has one", () => {
  registerStyleSheet(
    sheet({
      id: "switch.svelte",
      css: ".narrow { min-width: 0 }\n.caption { -winui-based-on: CaptionTextBlockStyle }"
    })
  );
  const toggle = control();
  const toggleElement = styledElement({
    control: toggle,
    elementType: "toggle-switch"
  });
  toggleElement.setClasses("narrow");
  assert.match(toggle.style ?? "", /TargetType="ToggleSwitch" BasedOn="\{StaticResource DefaultToggleSwitchStyle\}"/u);

  const panel = control();
  const panelElement = styledElement({
    control: panel,
    elementType: "stack-panel"
  });
  panelElement.setClasses("narrow");
  assert.doesNotMatch(panel.style ?? "", /BasedOn/u);

  const text = control();
  const textElement = styledElement({
    control: text,
    elementType: "text-block"
  });
  textElement.setClasses("caption");
  assert.match(text.style ?? "", /BasedOn="\{StaticResource CaptionTextBlockStyle\}"/u);
  for (const element of [toggleElement, panelElement, textElement]) {
    element.dispose();
  }
});

test("an element that matches nothing is left alone", () => {
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("nothing-styles-this");
  assert.equal(target.styleChanges, 0);
  element.dispose();
});

test("the same classes again do not rebuild the Style", () => {
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("card svelte-1");
  element.setClasses("svelte-1 card");
  assert.equal(target.styleChanges, 1);
  element.dispose();
});

test("a state rule listens for its events and restyles as the state changes", () => {
  registerStyleSheet(
    sheet({
      id: "hover.svelte",
      css: ".btn.svelte-2 { opacity: 1 }\n.btn.svelte-2:hover { opacity: 0.5 }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("btn svelte-2");
  assert.match(target.style ?? "", /Value="1"/u);
  assert.deepEqual([...target.handlers.keys()].sort((left, right) => left.localeCompare(right)), ["PointerEntered", "PointerExited"]);

  target.handlers.get("PointerEntered")?.();
  assert.match(target.style ?? "", /Value="0.5"/u);
  target.handlers.get("PointerExited")?.();
  assert.match(target.style ?? "", /Value="1"/u);

  element.setClasses("other");
  assert.equal(target.handlers.size, 0);
  element.dispose();
});

test("a rule under @media follows the window's size and listens only while one matches", () => {
  registerStyleSheet(
    sheet({
      id: "media.svelte",
      css: ".m.svelte-9 { opacity: 1 }\n@media (min-width: 600px) { .m.svelte-9 { opacity: 0.5 } }\n@media (max-width: 300px) { .m.svelte-9 { width: 7px } }"
    })
  );
  const target = control({
    width: 800,
    height: 400
  });
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("m svelte-9");
  assert.match(target.style ?? "", /Value="0.5"/u);
  assert.doesNotMatch(target.style ?? "", /Width/u);
  assert.ok(target.handlers.has("viewport"));

  target.properties["width"] = 200;
  target.handlers.get("viewport")?.();
  assert.match(target.style ?? "", /Value="1"/u);
  assert.match(target.style ?? "", /Width/u);

  element.setClasses("other");
  assert.equal(target.handlers.has("viewport"), false);
  element.dispose();
});

test("an @container rule follows the nearest container's size, and listens only while one matches", () => {
  registerPropertyGroups(containerGroups());
  registerStyleSheet(
    sheet({
      id: "container.svelte",
      css: ".host.svelte-8 { container: card / inline-size }\n.k.svelte-8 { opacity: 1 }\n@container card (min-width: 300px) { .k.svelte-8 { opacity: 0.5 } }"
    })
  );
  const host = control({
    actualWidth: 500,
    actualHeight: 100
  });
  const hostElement = styledElement({
    control: host,
    elementType: "border"
  });
  hostElement.setClasses("host svelte-8");
  const target = control({
    parent: host
  });
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("k svelte-8");
  assert.match(target.style ?? "", /Value="0.5"/u);
  assert.ok(host.handlers.has("SizeChanged"));

  host.properties["actualWidth"] = 200;
  host.handlers.get("SizeChanged")?.();
  assert.match(target.style ?? "", /Value="1"/u);

  element.setClasses("other");
  assert.equal(host.handlers.has("SizeChanged"), false);
  element.dispose();
  hostElement.dispose();
});

test("@starting-style styles an element until it is loaded, then the normal style takes over", () => {
  registerStyleSheet(
    sheet({
      id: "starting.svelte",
      css: ".s.svelte-6 { opacity: 1 }\n@starting-style { .s.svelte-6 { opacity: 0 } }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("s svelte-6");
  assert.match(target.style ?? "", /Value="0"/u);
  assert.ok(target.handlers.has("Loaded"));

  target.handlers.get("Loaded")?.();
  assert.match(target.style ?? "", /Value="1"/u);
  assert.equal(target.handlers.has("Loaded"), false);
  element.dispose();
});

test(":disabled and :checked start from the control's own state", () => {
  registerStyleSheet(
    sheet({
      id: "flags.svelte",
      css: ".f.svelte-3:disabled { opacity: 0.3 }\n.f.svelte-3:checked { width: 9px }"
    })
  );
  const target = control({
    isEnabled: false,
    isChecked: true
  });
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("f svelte-3");
  assert.match(target.style ?? "", /Opacity/u);
  assert.match(target.style ?? "", /Width/u);
  element.dispose();
});

test("replacing a sheet (hot reload) restyles live elements and keeps the others", () => {
  registerStyleSheet(
    sheet({
      id: "hot.svelte",
      css: ".h.svelte-4 { opacity: 0.1 }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("h svelte-4");
  assert.match(target.style ?? "", /Value="0.1"/u);

  registerStyleSheet(
    sheet({
      id: "hot.svelte",
      css: ".h.svelte-4 { opacity: 0.9 }"
    })
  );
  assert.match(target.style ?? "", /Value="0.9"/u);

  unregisterStyleSheet("hot.svelte");
  assert.equal(target.style, null);
  element.dispose();
});

test("replacing a sheet leaves an element that matches none of its rules untouched", () => {
  registerStyleSheet(
    sheet({
      id: "bystander.svelte",
      css: ".bystander { opacity: 0.3 }"
    })
  );
  registerStyleSheet(
    sheet({
      id: "other.svelte",
      css: ".other { opacity: 0.2 }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("bystander");
  const changes = target.styleChanges;

  registerStyleSheet(
    sheet({
      id: "other.svelte",
      css: ".other { opacity: 0.7 }"
    })
  );
  assert.equal(target.styleChanges, changes);
  element.dispose();
});

test("a later sheet beats an earlier one at equal specificity", () => {
  registerStyleSheet(
    sheet({
      id: "first.svelte",
      css: ".same { opacity: 0.1 }"
    })
  );
  registerStyleSheet(
    sheet({
      id: "second.svelte",
      css: ".same { opacity: 0.2 }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("same");
  assert.match(target.style ?? "", /Value="0.2"/u);
  registerStyleSheet(
    sheet({
      id: "first.svelte",
      css: ".same { opacity: 0.3 }"
    })
  );
  assert.match(target.style ?? "", /Value="0.2"/u);
  element.dispose();
});

test("style= and style: beat every class", () => {
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("early");
  assert.match(target.style ?? "", /Value="0.5"/u);

  element.setInlineStyle("opacity: 0.25; padding: 4px");
  assert.match(target.style ?? "", /Value="0.25"/u);
  assert.match(target.style ?? "", /Value="4,4,4,4"/u);

  // style:opacity={0.75} reaches the renderer as a longer style string.
  element.setInlineStyle("opacity: 0.25; padding: 4px; opacity: 0.75");
  assert.match(target.style ?? "", /Value="0.75"/u);

  element.setInlineStyle(null);
  assert.match(target.style ?? "", /Value="0.5"/u);
  assert.doesNotMatch(target.style ?? "", /Padding/u);
  element.dispose();
});

test("a grid's templates are written to its definitions", () => {
  registerStyleSheet(
    sheet({
      id: "grid.svelte",
      css: "grid.g { grid-template-columns: auto 1fr; gap: 4px }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "grid"
  });
  element.setClasses("g");
  assert.equal(target.columns, "columns:Auto,*");
  assert.match(target.style ?? "", /RowSpacing/u);
  element.dispose();
});

test("a scaled element pivots about its centre and follows its size", () => {
  registerPropertyGroups(transformGroups());
  registerStyleSheet(
    sheet({
      id: "pivot.svelte",
      css: ".grow { scale: 1.1 }\n.corner { rotate: 5deg; transform-origin: 100% 10px }"
    })
  );
  const target = control({
    actualWidth: 100,
    actualHeight: 40
  });
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("grow");
  assert.deepEqual(fake(target).assigned, {
    centerPoint: {
      x: 50,
      y: 20,
      z: 0
    }
  });

  target.properties["actualWidth"] = 200;
  target.handlers.get("SizeChanged")?.();
  assert.deepEqual(fake(target).assigned["centerPoint"], {
    x: 100,
    y: 20,
    z: 0
  });

  element.setClasses("corner");
  assert.deepEqual(fake(target).assigned, {
    centerPoint: {
      x: 200,
      y: 10,
      z: 0
    }
  });

  element.dispose();
  assert.equal(target.handlers.has("SizeChanged"), false);
});

test("a custom property on a class is a resource of the elements that have it", () => {
  registerPropertyGroups(resourceGroups());
  registerStyleSheet(
    sheet({
      id: "danger.svelte",
      css: ".danger { --button-background-pointer-over: #f00 }\n.quiet { --button-background-pointer-over: #0f0 }\n.danger.loud { --button-background-pointer-over: #00f }"
    })
  );
  const danger = control();
  const dangerElement = styledElement({
    control: danger,
    elementType: "button"
  });
  const other = control();
  const otherElement = styledElement({
    control: other,
    elementType: "button"
  });
  dangerElement.setClasses("danger");
  otherElement.setClasses("quiet");
  assert.equal(danger.resources.length, 1);
  assert.match(danger.resources[0] ?? "", /<SolidColorBrush x:Key="ButtonBackgroundPointerOver" Color="#FF0000"\/>/u);
  assert.match(other.resources[0] ?? "", /Color="#00FF00"/u);
  assert.doesNotMatch(mergedResources.join("\n"), /ButtonBackgroundPointerOver/u);

  dangerElement.setClasses("danger loud");
  assert.equal(danger.resources.length, 2);
  assert.match(danger.resources.at(-1) ?? "", /Color="#0000FF"/u);

  dangerElement.setClasses("");
  assert.deepEqual(danger.resources, []);
  dangerElement.setClasses("danger");
  dangerElement.dispose();
  assert.deepEqual(danger.resources, []);
  otherElement.dispose();
});

test("an outline turns on the control's system focus visuals", () => {
  registerPropertyGroups(focusGroups());
  registerStyleSheet(
    sheet({
      id: "focus.svelte",
      css: ".ring { outline: 2px solid #0af }"
    })
  );
  const target = control({ useSystemFocusVisuals: false });
  const element = styledElement({
    control: target,
    elementType: "button"
  });
  element.setClasses("ring");
  assert.equal(fake(target).assigned["useSystemFocusVisuals"], true);
  assert.match(target.style ?? "", /<Setter Property="FocusVisualPrimaryBrush" Value="#00AAFF"\/>/u);
  element.dispose();
});

test("a declaration the element cannot take fails with where it came from", () => {
  registerStyleSheet(
    sheet({
      id: "bad.svelte",
      css: ".b { gap: 4px }"
    })
  );
  const element = styledElement({
    control: control(),
    elementType: "border"
  });
  assert.throws(() => element.setClasses("b"), /<border> cannot take the style of bad\.svelte#0: gap has no WinUI meaning on <border>/u);
  element.dispose();
});

test("the classes of a prop that takes a Style make the Style an element of that type would get", () => {
  registerStyleSheet(
    sheet({
      id: "row.svelte",
      css: ".row { padding: 8px }\nlist-view-item.picked { opacity: 0.5 }\nbutton.picked { opacity: 0.1 }\n.row:hover { opacity: 0.9 }"
    })
  );
  const built = styleOfClasses({
    elementType: "list-view-item",
    classNames: "row picked"
  });
  const style = String(read(built, "xaml"));
  assert.match(style, /TargetType="ListViewItem" BasedOn="\{StaticResource DefaultListViewItemStyle\}"/u);
  assert.match(style, /<Setter Property="Padding" Value="8,8,8,8"\/>/u);
  assert.match(style, /<Setter Property="Opacity" Value="0\.5"\/>/u);
  assert.doesNotMatch(style, /0\.1|0\.9/u);
});

test("a prop given classes no rule knows gets no Style", () => {
  const unknown = styleOfClasses({
    elementType: "list-view-item",
    classNames: "nothing-styles-this"
  });
  const none = styleOfClasses({
    elementType: "list-view-item",
    classNames: ""
  });
  assert.equal(unknown, null);
  assert.equal(none, null);
});

test("a class that sets what only an element holds is refused for a Style", () => {
  registerStyleSheet(
    sheet({
      id: "grid-style.svelte",
      css: "grid.g2 { grid-template-columns: auto 1fr }"
    })
  );
  assert.throws(
    () => styleOfClasses({
      elementType: "grid",
      classNames: "g2"
    }),
    /"g2" sets columns, which an element holds and a Style does not/u
  );
});

test("an animation begins when its class applies and stops when the class goes", () => {
  registerPropertyGroups(animationGroups());
  registerStyleSheet(
    sheet({
      id: "animated.svelte",
      css: "@keyframes fade { from { opacity: 0 } to { opacity: 1 } }\n.fade { animation: fade 500ms ease-out forwards }\n.spin { animation: spin 1s linear infinite paused }\n@keyframes spin { to { transform: rotate(360deg) } }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("fade");
  assert.equal(target.animations.length, 1);
  assert.match(target.animations[0] ?? "", /^<Storyboard .*Storyboard\.TargetProperty="Opacity".*FillBehavior="HoldEnd"/u);
  element.setClasses("");
  assert.deepEqual(target.animations, []);
  element.setClasses("spin");
  assert.match(target.animations[0] ?? "", /^paused transform <Storyboard .*CompositeTransform\.Rotation.*RepeatBehavior="Forever"/u);
  assert.deepEqual(fake(target).assigned["renderTransformOrigin"], {
    x: 0.5,
    y: 0.5
  });
  element.dispose();
  assert.deepEqual(target.animations, []);
});

test("an animation that names no @keyframes fails when the element is styled", () => {
  registerPropertyGroups(animationGroups());
  registerStyleSheet(
    sheet({
      id: "missing.svelte",
      css: ".gone { animation: nowhere 1s }"
    })
  );
  const element = styledElement({
    control: control(),
    elementType: "border"
  });
  assert.throws(() => element.setClasses("gone"), /@keyframes nowhere is not declared in any stylesheet/u);
  element.dispose();
  unregisterStyleSheet("missing.svelte");
});

test("a clip-path inset clips the element to its size and unclips with the class", () => {
  registerPropertyGroups(effectGroups());
  registerStyleSheet(
    sheet({
      id: "clip.svelte",
      css: ".clipped { clip-path: inset(10px 5%) }"
    })
  );
  const target = control({
    actualWidth: 200,
    actualHeight: 100
  });
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("clipped");
  assert.deepEqual(fake(target).assigned["clip"], {
    x: 10,
    y: 10,
    width: 180,
    height: 80
  });
  element.setClasses("");
  assert.equal(fake(target).assigned["clip"], null);
});

test("a border-color transition animates the brush from the old color to the new one", () => {
  registerPropertyGroups(transformGroups());
  registerStyleSheet(
    sheet({
      id: "border-transition.svelte",
      css: ".edge { border-color: #00f; transition: border-color 200ms ease-out }\n.edge.on { border-color: #f00 }"
    })
  );
  const target = control();
  const element = styledElement({
    control: target,
    elementType: "border"
  });
  element.setClasses("edge");
  assert.deepEqual(target.animations, []);
  element.setClasses("edge on");
  assert.equal(target.animations.length, 1);
  assert.match(target.animations[0] ?? "", /^<Storyboard .*Storyboard\.TargetProperty="BorderBrush\.\(SolidColorBrush\.Color\)".*FillBehavior="HoldEnd"/u);
  assert.match(target.animations[0] ?? "", /0:00:00\.200/u);
  assert.deepEqual(target.brushes, ["borderBrush:#0000FF"]);
  element.setClasses("edge");
  assert.deepEqual(target.brushes, ["borderBrush:#FF0000"]);
  element.dispose();
  assert.deepEqual(target.animations, []);
  unregisterStyleSheet("border-transition.svelte");
});

test("a text-transform sets what the control's text is shown with and asks for it to be written again", () => {
  registerPropertyGroups(compatGroups());
  registerStyleSheet(
    sheet({
      id: "text-transform.svelte",
      css: ".shout { text-transform: uppercase }\n.title { text-transform: capitalize }"
    })
  );
  const target = control();
  let refreshes = 0;
  const element = styledElement({
    control: target,
    elementType: "text-block",
    refreshText() {
      refreshes++;
    }
  });
  element.setClasses("shout");
  assert.equal(textTransforms.get(target)?.("hello"), "HELLO");
  assert.equal(refreshes, 1);
  element.setClasses("title");
  assert.equal(textTransforms.get(target)?.("hello wide-world, it's x"), "Hello Wide-World, It's X");
  element.setClasses("");
  assert.equal(textTransforms.has(target), false);
  assert.ok(refreshes >= 3);
  element.setClasses("shout");
  element.dispose();
  assert.equal(textTransforms.has(target), false);
  unregisterStyleSheet("text-transform.svelte");
});
