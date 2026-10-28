import { hasStyle } from "./resources.ts";
import type { CssNative } from "./runtime.ts";
import { installCssRuntime, registerStyleSheet, styledElement, unregisterStyleSheet } from "./runtime.ts";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import type { OriginPoint } from "#src/css/translate/transform-origin.js";
import { translateStyleSheet } from "#src/css/translate/translate.js";
import type { NativeValue } from "#src/native-value.js";
import { read } from "#src/renderer/host/reflect.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The runtime against a fake WinUI: a "dictionary" is its XAML, a "style" is
// the XAML of the dictionary it was looked up in.

const resources = loadWinuiCatalogue();

interface FakeControl {
  style: string | null;
  styleChanges: number;
  columns: string | null;
  centerPoint: OriginPoint | null;
  handlers: Map<string, () => void>;
  properties: Record<string, NativeValue>;
}

function control(properties: Record<string, NativeValue> = {}) {
  return {
    style: null,
    styleChanges: 0,
    columns: null,
    centerPoint: null,
    handlers: new Map(),
    properties
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

const mergedResources: string[] = [];
const fakeNative: CssNative = {
  loadDictionary: xaml => ({ xaml }),
  mergeIntoApplication(dictionary) {
    mergedResources.push(String(read(dictionary, "xaml")));
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
  setGridDefinitions(target, kind, lengths) {
    fake(target).columns = `${kind}:${lengths}`;
  },
  setCenterPoint(target, point) {
    fake(target).centerPoint = point;
  },
  subscribe(target, event, handler) {
    const fakeControl = fake(target);
    fakeControl.handlers.set(event, handler);
    return () => fakeControl.handlers.delete(event);
  },
  read: ({ control, property }) => fake(control).properties[property]
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
  assert.deepEqual(target.centerPoint, {
    x: 50,
    y: 20
  });

  target.properties["actualWidth"] = 200;
  target.handlers.get("SizeChanged")?.();
  assert.deepEqual(target.centerPoint, {
    x: 100,
    y: 20
  });

  element.setClasses("corner");
  assert.deepEqual(target.centerPoint, {
    x: 200,
    y: 10
  });

  element.dispose();
  assert.equal(target.handlers.has("SizeChanged"), false);
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
