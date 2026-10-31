import { displayColor, gamutOfPrimaries } from "./display-color.ts";
import type { DisplayColorSource, MonitorPrimaries } from "./display-color.ts";
import type { PrimaryTarget } from "./display-config.ts";
import { ColorGamut } from "#src/css/media/features.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const SRGB = {
  red: {
    x: 0.64,
    y: 0.33
  },
  green: {
    x: 0.3,
    y: 0.6
  },
  blue: {
    x: 0.15,
    y: 0.06
  }
};
const DISPLAY_P3 = {
  red: {
    x: 0.68,
    y: 0.32
  },
  green: {
    x: 0.265,
    y: 0.69
  },
  blue: {
    x: 0.15,
    y: 0.06
  }
};
const REC2020 = {
  red: {
    x: 0.708,
    y: 0.292
  },
  green: {
    x: 0.17,
    y: 0.797
  },
  blue: {
    x: 0.131,
    y: 0.046
  }
};
const ADAPTER = 7n;
const TARGET = 3;

function targetWith(color: PrimaryTarget["color"]) {
  return {
    adapterId: ADAPTER,
    targetId: TARGET,
    color
  } satisfies PrimaryTarget;
}

function sourceOf({ target, monitors }: {
  target: PrimaryTarget | null;
  monitors: readonly MonitorPrimaries[];
}) {
  return {
    config: {
      primaryTarget: () => target
    },
    monitors: () => Promise.resolve(monitors),
    subscriptions: []
  } satisfies DisplayColorSource;
}

test("the gamut is the widest of sRGB, Display P3 and Rec. 2020 the primaries span", () => {
  assert.equal(gamutOfPrimaries(SRGB), ColorGamut.srgb);
  assert.equal(gamutOfPrimaries(DISPLAY_P3), ColorGamut.p3);
  assert.equal(gamutOfPrimaries(REC2020), ColorGamut.rec2020);
});

test("a display in HDR is high dynamic range, a wide color SDR display is not", () => {
  const hdr = displayColor(
    sourceOf({
      target: targetWith({
        isEnabled: true,
        isWideColorEnforced: false
      }),
      monitors: []
    })
  );
  const wideColor = displayColor(
    sourceOf({
      target: targetWith({
        isEnabled: true,
        isWideColorEnforced: true
      }),
      monitors: []
    })
  );
  const off = displayColor(
    sourceOf({
      target: null,
      monitors: []
    })
  );
  assert.equal(hdr.isHdr(), true);
  assert.equal(wideColor.isHdr(), false);
  assert.equal(off.isHdr(), false);
});

test("the gamut is sRGB until the monitor is opened, then the listeners hear the real one", async () => {
  const color = displayColor(
    sourceOf({
      target: targetWith({
        isEnabled: false,
        isWideColorEnforced: false
      }),
      monitors: [
        {
          adapterId: 1n,
          targetId: TARGET,
          ...SRGB
        },
        {
          adapterId: ADAPTER,
          targetId: TARGET,
          ...DISPLAY_P3
        }
      ]
    })
  );
  const heard = Promise.withResolvers<void>();
  color.subscribe(() => heard.resolve());
  assert.equal(color.gamut(), ColorGamut.srgb);
  await heard.promise;
  assert.equal(color.gamut(), ColorGamut.p3);
});

test("a monitor that cannot be opened leaves the gamut at sRGB", async () => {
  const color = displayColor({
    ...sourceOf({
      target: null,
      monitors: []
    }),
    monitors: () => Promise.reject(new Error("refused"))
  });
  const heard = Promise.withResolvers<void>();
  color.subscribe(() => heard.resolve());
  color.gamut();
  await heard.promise;
  assert.equal(color.gamut(), ColorGamut.srgb);
});
