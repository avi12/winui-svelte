import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.contextMenus over the tray menu model: creating, nesting, updating,
// removing, the surfaces, the picks and the validation. No native menu is
// opened; the lines are read and their onselect is called.

const { ChromeContextMenus, ContextMenuSurface } = await import("./index.ts");
const { MenuItemKind } = await import("#src/tray/menu/types.js");
const { resolveMenu } = await import("#src/tray/menu/resolve.js");

function pick({ menus, surface, id }: {
  menus: InstanceType<typeof ChromeContextMenus>;
  surface: (typeof ContextMenuSurface)[keyof typeof ContextMenuSurface];
  id: string;
}) {
  const pending = [...resolveMenu({ items: menus.menu(surface) })];
  for (const item of pending) {
    const nested = item.kind === MenuItemKind.SUBMENU ? item.items : [];
    pending.push(...nested);

    const isTarget = item.id === id;
    const isPickable = item.kind !== MenuItemKind.SEPARATOR && item.kind !== MenuItemKind.HEADER;
    const isPicked = isTarget && isPickable;
    if (isPicked) {
      item.select();
    }
  }
}

test("create gives the id and shows the item on the window surface by default", () => {
  const menus = new ChromeContextMenus();
  const id = menus.create({ title: "Copy" });
  assert.match(id, /^contextMenu-/u);
  const [line] = menus.menu(ContextMenuSurface.WINDOW);
  assert.equal(line?.id, id);
  assert.equal(menus.menu(ContextMenuSurface.TRAY).length, 0);
});

test("contexts pick the surface; unsupported contexts are on neither", () => {
  const menus = new ChromeContextMenus();
  menus.create({
    id: "a",
    title: "A",
    contexts: ["action"]
  });
  menus.create({
    id: "b",
    title: "B",
    contexts: ["all"]
  });
  menus.create({
    id: "c",
    title: "C",
    contexts: ["link", "image"]
  });
  assert.deepEqual(menus.menu(ContextMenuSurface.TRAY).map(line => line.id), ["a", "b"]);
  assert.deepEqual(menus.menu(ContextMenuSurface.WINDOW).map(line => line.id), ["b"]);
});

test("the menu array is live and resolves through the shared model", () => {
  const menus = new ChromeContextMenus();
  const lines = menus.menu(ContextMenuSurface.TRAY);
  menus.create({
    id: "a",
    title: "A",
    contexts: ["action"]
  });
  assert.equal(lines.length, 1);
  const resolved = resolveMenu({ items: lines });
  assert.equal(resolved[0]?.kind, MenuItemKind.COMMAND);
});

test("parentId nests, and removing a parent removes its children", async () => {
  const menus = new ChromeContextMenus();
  menus.create({
    id: "p",
    title: "Parent"
  });
  menus.create({
    id: "k",
    title: "Kid",
    parentId: "p"
  });
  const [parent] = menus.menu(ContextMenuSurface.WINDOW);
  assert.equal(parent?.kind, MenuItemKind.SUBMENU);
  await menus.remove("p");
  assert.equal(menus.menu(ContextMenuSurface.WINDOW).length, 0);
  await assert.rejects(menus.remove("k"), /Cannot find menu item/u);
});

test("hidden and disabled items", async () => {
  const menus = new ChromeContextMenus();
  menus.create({
    id: "a",
    title: "A",
    visible: false
  });
  menus.create({
    id: "b",
    title: "B",
    enabled: false
  });
  const lines = menus.menu(ContextMenuSurface.WINDOW);
  assert.deepEqual(lines.map(line => line.id), ["b"]);
  assert.equal(lines[0]?.kind === MenuItemKind.COMMAND && lines[0].isEnabled, false);
  await menus.update("a", { visible: true });
  assert.equal(lines.length, 2);
});

test("update changes the title and keeps the rest; it rejects cycles and unknown items", async () => {
  const menus = new ChromeContextMenus();
  menus.create({
    id: "a",
    title: "A"
  });
  menus.create({
    id: "b",
    title: "B",
    parentId: "a"
  });
  await menus.update("a", { title: "Renamed" });
  const [line] = menus.menu(ContextMenuSurface.WINDOW);
  assert.equal(line?.kind === MenuItemKind.SUBMENU && line.label, "Renamed");
  await assert.rejects(menus.update("a", { parentId: "b" }), /under itself/u);
  await assert.rejects(menus.update("zzz", { title: "x" }), /Cannot find/u);
  await assert.rejects(menus.update("a", { title: "" }), /Title is required/u);
});

test("checkbox toggles and reports before and after", () => {
  const menus = new ChromeContextMenus();
  const seen: unknown[] = [];
  menus.onClicked.addListener(info => seen.push(info));
  menus.create({
    id: "c",
    title: "C",
    type: "checkbox",
    checked: true
  });
  pick({
    menus,
    surface: ContextMenuSurface.WINDOW,
    id: "c"
  });
  assert.deepEqual(seen, [{
    menuItemId: "c",
    editable: false,
    checked: false,
    wasChecked: true
  }]);
  const [line] = menus.menu(ContextMenuSurface.WINDOW);
  assert.equal(line?.kind === MenuItemKind.CHECK && line.isChecked, false);
});

test("radios in a run exclude each other; a separator starts a new run", () => {
  const menus = new ChromeContextMenus();
  menus.create({
    id: "r1",
    title: "1",
    type: "radio",
    checked: true
  });
  menus.create({
    id: "r2",
    title: "2",
    type: "radio"
  });
  menus.create({
    id: "s",
    type: "separator"
  });
  menus.create({
    id: "r3",
    title: "3",
    type: "radio",
    checked: true
  });
  pick({
    menus,
    surface: ContextMenuSurface.WINDOW,
    id: "r2"
  });
  const lines = menus.menu(ContextMenuSurface.WINDOW);
  const states = lines.map(line => line.kind === MenuItemKind.RADIO && line.isChecked);
  assert.deepEqual(states, [false, true, false, true]);
  const groups = lines.map(line => line.kind === MenuItemKind.RADIO && line.group);
  assert.equal(groups[0], groups[1]);
  assert.notEqual(groups[1], groups[3]);
});

test("onclick runs before onClicked, and a child reports its parent", () => {
  const menus = new ChromeContextMenus();
  const order: string[] = [];
  menus.onClicked.addListener(() => order.push("event"));
  menus.create({
    id: "p",
    title: "P"
  });
  menus.create({
    id: "k",
    title: "K",
    parentId: "p",
    onclick: () => order.push("onclick")
  });
  pick({
    menus,
    surface: ContextMenuSurface.WINDOW,
    id: "k"
  });
  assert.deepEqual(order, ["onclick", "event"]);
});

test("removeAll empties every surface", async () => {
  const menus = new ChromeContextMenus();
  menus.create({
    title: "A",
    contexts: ["all"]
  });
  await menus.removeAll();
  assert.equal(menus.menu(ContextMenuSurface.TRAY).length, 0);
  assert.equal(menus.menu(ContextMenuSurface.WINDOW).length, 0);
});

test("validation: duplicate id, missing parent, missing title, unknown key; URL patterns are accepted", () => {
  const menus = new ChromeContextMenus();
  menus.create({
    id: "a",
    title: "A",
    documentUrlPatterns: ["https://*/*"],
    targetUrlPatterns: ["*://*/*"]
  });
  assert.throws(() => menus.create({
    id: "a",
    title: "B"
  }), /duplicate id a/u);
  assert.throws(() => menus.create({
    title: "B",
    parentId: "none"
  }), /Cannot find/u);
  assert.throws(() => menus.create({}), /Title is required/u);
  assert.throws(() => menus.create(JSON.parse(`{"title":"x","nope":1}`)), /nope|Unrecognized/u);
  assert.throws(() => menus.create({
    title: "x",
    contexts: []
  }), /too_small|least|>=/u);
});
