import { extractTrayManifests } from "./extract-tray.ts";
import { lowerTraySvelte } from "./lower-tray-svelte.ts";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

// The markup of a tray.svelte is read as text and lowered to the plain model
// of a hand-written tray.ts; these tests compare the code, run it against a
// fake defineTray, and check that an unsupported construct is named with its
// file and line.

const FILE = "entrypoints/tray.svelte";
const GUID = "7d1c5a52-3f1b-4a63-9f5e-2f4d6b0c8a11";
const MENU_IMPORT = `import { TrayMenu, TrayMenuHeader, TrayMenuItem, TrayMenuSeparator, TrayMenuSubmenu } from "winui-svelte/tray/menu/svelte";`;
const MODULE_SCRIPT = `<script module lang="ts">
  export const options = {
    icon: "tray.ico",
    tooltip: "Recorder",
    guid: "${GUID}"
  };
  let isAutostart = false;
  let recent: string[] = ["a.png", "b.png"];
  export function toggleAutostart() {
    isAutostart = !isAutostart;
  }
</script>
`;

function lower({ markup, instance = "" }: {
  markup: string;
  instance?: string;
}) {
  return lowerTraySvelte({
    source: `${MODULE_SCRIPT}<script lang="ts">\n  ${MENU_IMPORT}\n${instance}</script>\n${markup}`,
    file: FILE
  });
}

function load(markup: string) {
  const code = stripTypeScriptTypes(lower({ markup }))
    .replace(/^import .*$/mu, "")
    .replace(/^export function/mu, "function")
    .replace("export default", "const tray =");
  // oxlint-disable-next-line typescript/no-implied-eval -- runs the lowered tray module to read the menu it builds
  const make = new Function("defineTray", "LoweredMenuItemKind", `${code}
return { menu: tray.menu, toggleAutostart };`);
  const loaded: {
    menu: () => MenuItem[];
    toggleAutostart: () => void;
  } = make((given: unknown) => given, MenuItemKind);
  return loaded;
}

function messageOf(markup: string) {
  try {
    lower({ markup });
  } catch (error) {
    return error instanceof Error ? error.message : "";
  }

  return "";
}

test("a small menu lowers to the exact plain code", () => {
  // noinspection JSUnresolvedReference: Svelte markup in a string
  const code = lowerTraySvelte({
    source: `<script module lang="ts">
  export const options = { icon: "tray.ico", guid: "g" };
</script>
<script lang="ts">
  import { TrayMenu, TrayMenuItem } from "winui-svelte/tray/menu/svelte";
</script>
<TrayMenu>
  <TrayMenuItem id="open" label="Open" isRequired />
  <TrayMenuItem id="auto" kind="check" label="Auto {1}" isChecked={() => true} />
</TrayMenu>`,
    file: FILE
  });
  assert.equal(
    code, [
      `import { defineTray, MenuItemKind as LoweredMenuItemKind } from "winui-svelte/tray/standalone";`,
      `export default defineTray({`,
      `  icon: "tray.ico",`,
      `  guid: "g",`,
      "  menu: () => [{ kind: LoweredMenuItemKind.COMMAND, id: \"open\", label: \"Open\", isRequired: true }, { kind: LoweredMenuItemKind.CHECK, id: \"auto\", label: `Auto ${1}`, isChecked: () => true }],",
      `});`,
      ``
    ].join("\n")
  );
});

test("the lowered module keeps the script, drops the component import, and the build can read its manifest", () => {
  const code = lower({
    markup: `<TrayMenu />`,
    instance: "  function openApp() {}"
  });
  assert.deepEqual(extractTrayManifests(code), [{
    icon: "tray.ico",
    tooltip: "Recorder",
    guid: GUID
  }]);
  assert.match(code, /function openApp\(\)/u);
  assert.match(code, /let isAutostart = false;/u);
  assert.doesNotMatch(code, /tray\/menu\/svelte|\$state/u);
});

test("if, each, const and submenu lower to the model a hand-written menu has", () => {
  // noinspection JSUnresolvedReference: Svelte markup in a string
  const { menu } = load(
    `<TrayMenu>
  <TrayMenuHeader id="title" label="Recorder" />
  <TrayMenuItem id="open" label="Open" isRequired />
  <TrayMenuSeparator id="line" />
  {#if recent.length > 0}
    <TrayMenuItem id="auto" kind="check" label="Start with Windows" isChecked={() => isAutostart} level="standard" />
  {:else}
    <TrayMenuItem id="none" label="Nothing yet" />
  {/if}
  <TrayMenuSubmenu id="recent" label="Recent {recent.length}" emptyLabel="Nothing yet">
    {#each recent as name, iName (name)}
      {@const id = \`recent.\${iName}\`}
      <TrayMenuItem {id} label={name} />
    {/each}
  </TrayMenuSubmenu>
</TrayMenu>`
  );
  const lines = menu();
  assert.deepEqual(lines.map(line => `${line.kind}:${line.id}`), [
    "header:title",
    "command:open",
    "separator:line",
    "check:auto",
    "submenu:recent"
  ]);
  const [, open, , auto, recentLine] = lines;
  assert.equal(open?.kind === MenuItemKind.COMMAND && open.isRequired, true);
  assert.equal(auto?.kind === MenuItemKind.CHECK && auto.level, "standard");
  assert.equal(recentLine?.kind === MenuItemKind.SUBMENU && recentLine.label, "Recent 2");
  const isDynamicSubmenu = recentLine?.kind === MenuItemKind.SUBMENU && typeof recentLine.items === "function";
  const items = isDynamicSubmenu ? recentLine.items() : [];
  assert.deepEqual(
    items.map(item => ({
      kind: item.kind,
      id: item.id,
      label: item.kind === MenuItemKind.COMMAND ? item.label : ""
    })), [
      {
        kind: "command",
        id: "recent.0",
        label: "a.png"
      },
      {
        kind: "command",
        id: "recent.1",
        label: "b.png"
      }
    ]
  );
});

test("a check's tick is read when the menu opens", () => {
  // noinspection JSUnresolvedReference: Svelte markup in a string
  const { menu, toggleAutostart } = load(`<TrayMenu><TrayMenuItem id="auto" kind="check" label="Auto" isChecked={() => isAutostart} /></TrayMenu>`);
  function tick() {
    const [line] = menu();
    const isTick = line?.kind === MenuItemKind.CHECK && typeof line.isChecked === "function";
    return isTick ? line.isChecked() : undefined;
  }

  assert.equal(tick(), false);
  toggleAutostart();
  assert.equal(tick(), true);
});

test("a rune in the script is refused with the reason and the line", () => {
  const message = lowerSafely(
    `<script module lang="ts">
  export const options = { icon: "a", guid: "g" };
  let count = $state(0);
</script>
<TrayMenu />`
  );
  assert.match(message, /^entrypoints\/tray\.svelte:3:15: \$state is not supported in a tray\.svelte: the menu is read each time it opens/u);
});

test("unsupported markup is refused, naming the line and the construct", () => {
  // noinspection JSUnresolvedReference: Svelte markup in a string
  const cases = [
    [`<TrayMenu>\n  {#await load}\n  {/await}\n</TrayMenu>`, /:\d+:\d+: \{#await\} is not supported/u],
    [`<TrayMenu>\n  <TrayMenuItem id="a" label="A" bind:this={node} />\n</TrayMenu>`, /bind: is not supported/u],
    [`<TrayMenu>\n  <TrayMenuItem id="a" label="A" use:thing />\n</TrayMenu>`, /use: is not supported/u],
    [`<TrayMenu>\n  <Other id="a" />\n</TrayMenu>`, /the component <Other> is not supported/u],
    [`<TrayMenu>\n  <svelte:fragment />\n</TrayMenu>`, /<svelte:fragment> is not supported/u],
    [`<TrayMenu>\n  {@html "x"}\n</TrayMenu>`, /\{@html\} is not supported/u],
    [`<TrayMenu>\n  {@render row()}\n</TrayMenu>`, /\{@render\} is not supported/u],
    [`<TrayMenu>\n  <TrayMenuItem id="a" label="A" kind="submenu" />\n</TrayMenu>`, /kind="submenu" is not supported/u],
    [`<TrayMenu>\n  {#each recent as name}\n    <TrayMenuItem id={name} label={name} />\n  {:else}\n    <TrayMenuItem id="none" label="none" />\n  {/each}\n</TrayMenu>`, /\{:else\} of \{#each\} is not supported/u],
    [`<TrayMenu profile={undefined} />`, /an attribute on <TrayMenu> is not supported/u],
    [`<div />`, /markup outside the menu is not supported/u],
    [`<TrayMenu>\n  <TrayMenuItem id="a" label="A">text</TrayMenuItem>\n</TrayMenu>`, /children inside <TrayMenuItem> is not supported/u]
  ] as const;
  for (const [markup, expected] of cases) {
    assert.match(messageOf(markup), expected, markup);
  }
});

test("an error carries the line of the construct", () => {
  assert.match(messageOf(`<TrayMenu>\n  <TrayMenuSeparator id="x" />\n  {#await load}\n  {/await}\n</TrayMenu>`), /^entrypoints\/tray\.svelte:\d+:3: /u);
  const line = Number(/tray\.svelte:(\d+):/u.exec(messageOf(`<TrayMenu>\n  {@html "x"}\n</TrayMenu>`))?.[1]);
  assert.equal(line, MODULE_SCRIPT.split("\n").length + 4);
});

test("a file with no options export, or a style block, is refused", () => {
  assert.match(lowerSafely(`<script lang="ts">\n</script>\n<TrayMenu />`), /no `export const options/u);
  assert.match(lowerSafely(`<script module lang="ts">\n  export const options = { icon: "a", guid: "g" };\n</script>\n<TrayMenu />\n<style>\n  a { color: red; }\n</style>`), /<style> is not supported/u);
  assert.match(lowerSafely(`<script module lang="ts">\n  export const options = { icon: "a", guid: "g", menu: [] };\n</script>\n<TrayMenu />`), /a menu property in the options is not supported/u);
  assert.match(lowerSafely(`<script lang="ts">\n  import Row from "./Row.svelte";\n</script>\n<TrayMenu />`), /importing the component \.\/Row\.svelte/u);
});

function lowerSafely(source: string) {
  try {
    lowerTraySvelte({
      source,
      file: FILE
    });
  } catch (error) {
    return error instanceof Error ? error.message : "";
  }

  return "";
}
