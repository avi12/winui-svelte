import { computeDeclarations, resolveBuiltVariable } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { lowerDeclarations } from "./properties.ts";
import type { WriteSeam } from "./property-kit.ts";
import { shadowGroups } from "./shadow-properties.ts";
import type { ShadowHost } from "./shadow-properties.ts";
import { surfaceGroups } from "./surface-properties.ts";
import { formatDiagnostic, translateStyleSheet } from "./translate.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();

function lowerRule({ declarations, host }: {
  declarations: string;
  host?: ShadowHost;
}) {
  const diagnostics: string[] = [];
  const translation = translateStyleSheet({
    file: "t.svelte",
    css: `.t { ${declarations} }`,
    resources
  });
  diagnostics.push(...translation.diagnostics.map(formatDiagnostic));
  const [rule] = translation.sheet.rules;
  const lowered = lowerDeclarations({
    extraGroups: [...surfaceGroups(), ...shadowGroups(host)],
    computed: computeDeclarations({
      matched: rule === undefined ? [] : [rule],
      inline: []
    }),
    options: {
      elementType: null,
      resolveVariable: resolveBuiltVariable,
      hasStyle: () => true,
      report: ({ message }) => diagnostics.push(message)
    }
  });
  return {
    setters: lowered.setters.map(entry => entry.property),
    writes: lowered.writes,
    diagnostics
  };
}

test("box-shadow stays a ThemeShadow unless -winui-shadow says composition", () => {
  const theme = lowerRule({ declarations: "box-shadow: 2px 4px 8px red" });
  assert.deepEqual(theme.setters, ["Shadow"]);
  assert.deepEqual(theme.writes.filter(write => write.target === "drop-shadows"), []);
  const named = lowerRule({ declarations: "-winui-shadow: theme; box-shadow: 2px 4px 8px red" });
  assert.deepEqual(named.setters, ["Shadow"]);
});

test("composition lowers every layer to a write with its colour, offset, blur and spread", () => {
  const lowered = lowerRule({ declarations: "-winui-shadow: composition; box-shadow: 2px 4px 8px 3px #ff0000, 0 0 4px rgba(0, 0, 255, 0.5)" });
  assert.deepEqual(lowered.diagnostics, []);
  assert.deepEqual(lowered.setters, []);
  const [write] = lowered.writes;
  assert.equal(write?.target, "drop-shadows");
  assert.deepEqual(JSON.parse(write?.value ?? "[]"), [
    {
      x: 2,
      y: 4,
      blur: 8,
      spread: 3,
      color: "#FF0000"
    },
    {
      x: 0,
      y: 0,
      blur: 4,
      spread: 0,
      color: "#80" + "0000FF"
    }
  ]);
});

test("a composition shadow with no colour is the filter's default black", () => {
  const [write] = lowerRule({ declarations: "-winui-shadow: composition; box-shadow: 0 2px 4px" }).writes;
  assert.deepEqual(JSON.parse(write?.value ?? "[]"), [{
    x: 0,
    y: 2,
    blur: 4,
    spread: 0,
    color: "#80000000"
  }]);
});

test("composition composes with an elevation: the ThemeShadow stays", () => {
  const lowered = lowerRule({ declarations: "-winui-shadow: composition; box-shadow: 0 2px 4px red; -winui-elevation: 16px" });
  assert.deepEqual(lowered.setters, ["Shadow"]);
  assert.equal(lowered.writes.some(write => write.target === "drop-shadows"), true);
});

const refused: [string, string, RegExp][] = [
  ["inset", "-winui-shadow: composition; box-shadow: inset 0 0 4px red", /box-shadow: inset is not drawn/u],
  ["a var() colour", "-winui-shadow: composition; box-shadow: 0 0 4px var(--shadow)", /takes a colour written out/u],
  ["a negative blur", "-winui-shadow: composition; box-shadow: 0 0 -4px red", /blur radius cannot be negative/u],
  ["no offset", "-winui-shadow: composition; box-shadow: red", /box-shadow: expected offset-x offset-y/u],
  ["an unknown mode", "-winui-shadow: glow; box-shadow: 0 0 4px red", /-winui-shadow: expected one of theme, composition/u],
  ["a receiver that is not a name", "-winui-shadow-receiver: 1a", /expected a name/u]
];

for (const [name, declarations, message] of refused) {
  test(`${name} is refused with its reason`, () => {
    const lowered = lowerRule({ declarations });
    assert.match(lowered.diagnostics.join(" "), message);
    assert.deepEqual(lowered.writes.filter(write => write.target === "drop-shadows"), []);
  });
}

test("the window shadow is drawn by the host, and put back when the write changes", () => {
  const calls: string[] = [];
  const host = {
    setLayers({ layers }) {
      calls.push(`layers ${layers.length}`);
    },
    join({ name, role }) {
      calls.push(`join ${role} ${name}`);
      return () => calls.push(`leave ${role} ${name}`);
    }
  } satisfies ShadowHost;
  const lowered = lowerRule({
    declarations: [
      "-winui-shadow: composition; box-shadow: 0 2px 4px red",
      "-winui-shadow-receiver: panel; -winui-shadow-cast-on: panel; -winui-elevation: 8px"
    ].join("; "),
    host
  });
  const groups = shadowGroups(host);
  const undos = lowered.writes.map(write => {
    const handlers = groups.flatMap(group => Object.entries(group.writes));
    const handler = handlers.find(([target]) => target === write.target)?.[1];
    return handler?.({
      control: {},
      value: write.value,
      native: {} as unknown as WriteSeam,
      refreshText() {}
    });
  });
  for (const undo of undos) {
    undo?.();
  }

  assert.deepEqual(calls, [
    "layers 1",
    "join receiver panel",
    "join caster panel",
    "layers 0",
    "leave receiver panel",
    "leave caster panel"
  ]);
});

test("a caster with no ThemeShadow warns", () => {
  const lowered = lowerRule({ declarations: "-winui-shadow-cast-on: panel" });
  assert.match(lowered.diagnostics.join(" "), /receivers belong to the element's ThemeShadow/u);
});
