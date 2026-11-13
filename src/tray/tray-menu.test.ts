import { createTrayMenu, placeMenuWindow } from "./tray-menu.ts";
import type { MenuPlacement } from "./tray-menu.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const WORK_AREA = {
  left: 0,
  top: 0,
  right: 1920,
  bottom: 1040
};
const SECOND_MONITOR = {
  left: -1920,
  top: 0,
  right: 0,
  bottom: 1040
};
const SIZE = 1;

test("a point inside the work area is where the window goes", () => {
  assert.deepEqual(
    placeMenuWindow({
      point: {
        x: 500,
        y: 400
      },
      size: SIZE,
      workArea: WORK_AREA
    }), {
      x: 500,
      y: 400,
      width: SIZE,
      height: SIZE
    }
  );
});

test("a point on the taskbar below the work area lands on its bottom edge, inside it", () => {
  const placement = placeMenuWindow({
    point: {
      x: 1900,
      y: 1060
    },
    size: SIZE,
    workArea: WORK_AREA
  });
  assert.deepEqual([placement.x, placement.y], [1900, 1039]);
});

test("a point past any edge is pulled in, on a monitor left of the primary one too", () => {
  const farRight = placeMenuWindow({
    point: {
      x: 5000,
      y: -40
    },
    size: SIZE,
    workArea: WORK_AREA
  });
  assert.deepEqual([farRight.x, farRight.y], [1919, 0]);
  const onSecond = placeMenuWindow({
    point: {
      x: -3000,
      y: 2000
    },
    size: SIZE,
    workArea: SECOND_MONITOR
  });
  assert.deepEqual([onSecond.x, onSecond.y], [-1920, 1039]);
});

test("the menu exists only between show and close, and a second show moves it", () => {
  const heard: (MenuPlacement | null)[] = [];
  const asked: {
    x: number;
    y: number;
  }[] = [];
  const menu = createTrayMenu({
    native: {
      workAreaAt(point) {
        asked.push(point);
        return WORK_AREA;
      }
    },
    onChange: placement => heard.push(placement)
  });
  assert.equal(menu.placement, null, "nothing before the first show");
  menu.close();
  assert.deepEqual(heard, [], "closing a closed menu is silent");
  menu.show({
    x: 10,
    y: 20
  });
  menu.show({
    x: 30,
    y: 40
  });
  const positions = Array.from<MenuPlacement | null>(heard).map(placement => (
    placement === null ? null : [placement.x, placement.y]
  ));
  assert.deepEqual(positions, [[10, 20], [30, 40]]);
  assert.deepEqual(asked, [{
    x: 10,
    y: 20
  }, {
    x: 30,
    y: 40
  }], "the work area is that of the monitor under the point, asked each time");
  menu.close();
  menu.close();
  assert.equal(heard.at(-1), null);
  assert.equal(heard.length, 3, "one close is heard, the second is not");
  assert.equal(menu.placement, null);
});
