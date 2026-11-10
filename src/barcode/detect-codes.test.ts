import type { Bounds, DetectedCode } from "./barcode-types.ts";
import { Symbology } from "./barcode-types.ts";
import { detectCodes } from "./detect-codes.ts";
import { ErrorCorrectionLevel } from "./qr/qr-tables.ts";
import { checkDigitOf, encodeCode128, encodeEan } from "./test-support/linear-encoder.ts";
import { encodeQr } from "./test-support/qr-encoder.ts";
import { QR_FIXTURES } from "./test-support/qr-fixtures.ts";
import type { Image } from "./test-support/render.ts";
import {
  blur,
  embed,
  gridFromBars,
  gridFromRows,
  render
} from "./test-support/render.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const URL_TEXT = "https://github.com/avi12/winui-svelte";
const BAR_HEIGHT_MODULES = 30;

function detect(options: Image & {
  readonly region?: Bounds;
  readonly formats?: readonly Symbology[];
}) {
  return detectCodes(options);
}

function only(codes: readonly DetectedCode[]) {
  assert.equal(codes.length, 1, JSON.stringify(codes.map(code => [code.format, code.text])));
  const [code] = codes;
  assert.ok(code);
  return code;
}

function clutter({ x, y }: {
  readonly x: number;
  readonly y: number;
}) {
  // Text-like background: a quiet bright page with dark dashes.
  const isDash = (x * 13 + y * 7) % 29 < 3 && y % 9 < 4;
  return isDash ? 70 : 235;
}

function qrGrid(text: string) {
  return encodeQr({
    text,
    level: ErrorCorrectionLevel.MEDIUM
  }).grid;
}

test("a QR code is found with its text, format, bounds and corners", () => {
  const image = embed({
    image: render({
      grid: qrGrid(URL_TEXT),
      scale: 5,
      quietModules: 3
    }),
    width: 500,
    height: 400,
    offset: {
      x: 120,
      y: 60
    },
    fill: () => 255
  });
  const code = only(detect(image));
  assert.equal(code.format, Symbology.QR_CODE);
  assert.equal(code.text, URL_TEXT);
  const symbolSize = qrGrid(URL_TEXT).width * 5;
  assert.ok(Math.abs(code.bounds.x - (120 + 3 * 5)) <= 3, `x ${code.bounds.x}`);
  assert.ok(Math.abs(code.bounds.y - (60 + 3 * 5)) <= 3, `y ${code.bounds.y}`);
  assert.ok(Math.abs(code.bounds.width - symbolSize) <= 4, `width ${code.bounds.width}`);
  assert.ok(Math.abs(code.bounds.height - symbolSize) <= 4, `height ${code.bounds.height}`);
  assert.equal(code.corners.length, 4);
  const [topLeft, , bottomRight] = code.corners;
  assert.ok(topLeft && Math.abs(topLeft.x - code.bounds.x) <= 3);
  assert.ok(bottomRight && Math.abs(bottomRight.y - (code.bounds.y + code.bounds.height)) <= 3);
});

test("every fixture made by another encoder is found in a rendered image", () => {
  for (const fixture of QR_FIXTURES) {
    const scale = fixture.version > 20 ? 3 : 5;
    const code = only(
      detect(
        render({
          grid: gridFromRows(fixture.rows),
          scale
        })
      )
    );
    assert.equal(code.text, fixture.text, fixture.name);
  }
});

test("a QR code is found rotated by quarter turns and mirrored", () => {
  for (const isMirrored of [false, true]) {
    for (const quarterTurns of [0, 1, 2, 3]) {
      const code = only(
        detect(
          render({
            grid: qrGrid(URL_TEXT),
            scale: 4,
            quarterTurns,
            isMirrored
          })
        )
      );
      assert.equal(code.text, URL_TEXT, `turns ${quarterTurns} mirrored ${isMirrored}`);
    }
  }
});

test("a QR code is found tilted at any angle", () => {
  for (const angle of [10, 23, 45, 67, 100, 135, 200, 291, 340]) {
    const code = only(
      detect(
        render({
          grid: qrGrid(URL_TEXT),
          scale: 6,
          angle
        })
      )
    );
    assert.equal(code.text, URL_TEXT, `angle ${angle}`);
  }
});

test("a QR code is found with no quiet zone, cropped to its edge", () => {
  const code = only(
    detect(
      render({
        grid: qrGrid(URL_TEXT),
        scale: 5,
        quietModules: 0
      })
    )
  );
  assert.equal(code.text, URL_TEXT);
  assert.equal(code.bounds.x, 0);
  assert.equal(code.bounds.y, 0);
});

test("a QR code is found at 1, 2 and 3 pixels a module, and scaled far up", () => {
  for (const scale of [1, 2, 3, 9, 24]) {
    const code = only(
      detect(
        render({
          grid: qrGrid("scale test"),
          scale
        })
      )
    );
    assert.equal(code.text, "scale test", `scale ${scale}`);
  }
});

test("a large version is found", () => {
  const text = "large ".repeat(200);
  const { grid, version } = encodeQr({
    text,
    level: ErrorCorrectionLevel.LOW
  });
  assert.ok(version >= 20, `version ${version}`);
  assert.equal(
    only(
      detect(
        render({
          grid,
          scale: 3
        })
      )
    ).text, text
  );
  assert.equal(
    only(
      detect(
        render({
          grid,
          scale: 4,
          angle: 30
        })
      )
    ).text, text
  );
});

test("a damaged QR code is repaired by error correction", () => {
  const { grid } = encodeQr({
    text: URL_TEXT,
    level: ErrorCorrectionLevel.QUARTILE
  });
  const damaged = grid.inverted().inverted();
  const dimension = grid.width;
  for (let y = 12; y < 17; y++) {
    for (let x = 10; x < 17; x++) {
      damaged.bits[y * dimension + x] = damaged.bits[y * dimension + x] === 1 ? 0 : 1;
    }
  }
  for (let x = dimension - 9; x < dimension - 5; x++) {
    damaged.bits[(dimension - 8) * dimension + x] = damaged.bits[(dimension - 8) * dimension + x] === 1 ? 0 : 1;
  }
  assert.notDeepEqual(damaged.bits, grid.bits);
  assert.equal(
    only(
      detect(
        render({
          grid: damaged,
          scale: 6
        })
      )
    ).text, URL_TEXT
  );
});

test("a QR code with too much damage is not read, and nothing is invented", () => {
  const { grid } = encodeQr({
    text: URL_TEXT,
    level: ErrorCorrectionLevel.LOW
  });
  const ruined = grid.inverted().inverted();
  for (let y = 9; y < grid.height - 9; y++) {
    for (let x = 9; x < grid.width - 9; x++) {
      const isFlipped = (x * 3 + y * 5) % 4 < 2;
      if (isFlipped) {
        ruined.bits[y * grid.width + x] = ruined.bits[y * grid.width + x] === 1 ? 0 : 1;
      }
    }
  }
  assert.deepEqual(
    detect(
      render({
        grid: ruined,
        scale: 6
      })
    ), []
  );
});

test("a blurred, noisy screenshot-like QR code is read", () => {
  const image = blur({
    image: render({
      grid: qrGrid(URL_TEXT),
      scale: 4
    }),
    radius: 1
  });
  assert.equal(only(detect(image)).text, URL_TEXT);
});

test("a light-on-dark QR code is read", () => {
  const code = only(
    detect(
      render({
        grid: qrGrid(URL_TEXT),
        scale: 5,
        foreground: 255,
        background: 20
      })
    )
  );
  assert.equal(code.text, URL_TEXT);
});

test("a QR code among page clutter is found by its region, and the result is in whole-image pixels", () => {
  const image = embed({
    image: render({
      grid: qrGrid(URL_TEXT),
      scale: 4,
      quietModules: 3
    }),
    width: 700,
    height: 500,
    offset: {
      x: 300,
      y: 200
    },
    fill: clutter
  });
  const region = {
    x: 250,
    y: 150,
    width: 400,
    height: 330
  };
  const code = only(
    detect({
      ...image,
      region
    })
  );
  assert.equal(code.text, URL_TEXT);
  assert.ok(code.bounds.x >= 300 && code.bounds.y >= 200, JSON.stringify(code.bounds));
  assert.ok(code.bounds.x + code.bounds.width <= 700);
  assert.deepEqual(
    detect({
      ...image,
      region: {
        x: 0,
        y: 0,
        width: 200,
        height: 100
      }
    }), []
  );
});

test("two QR codes in one image are both found", () => {
  const left = render({
    grid: qrGrid("first code"),
    scale: 4
  });
  const right = render({
    grid: qrGrid("second code, a longer one"),
    scale: 4
  });
  const image = embed({
    image: left,
    width: left.width + right.width + 40,
    height: Math.max(left.height, right.height),
    offset: {
      x: 0,
      y: 0
    },
    fill: () => 255
  });
  const both = embed({
    image: right,
    width: image.width,
    height: image.height,
    offset: {
      x: left.width + 40,
      y: 0
    },
    fill: () => 255
  });
  const merged = new Uint8ClampedArray(image.pixels.length);
  for (let i = 0; i < merged.length; i += 4) {
    const level = Math.min(image.pixels[i] ?? 255, both.pixels[i] ?? 255);
    merged.set([level, level, level, 255], i);
  }
  const texts = detect({
    width: image.width,
    height: image.height,
    pixels: merged
  }).map(code => code.text).sort();
  assert.deepEqual(texts, ["first code", "second code, a longer one"]);
});

test("the formats option limits what is looked for", () => {
  const image = render({
    grid: qrGrid("only a QR"),
    scale: 4
  });
  assert.equal(
    detect({
      ...image,
      formats: [Symbology.QR_CODE]
    }).length, 1
  );
  assert.deepEqual(
    detect({
      ...image,
      formats: [Symbology.EAN_13, Symbology.CODE_128]
    }), []
  );
  assert.deepEqual(
    detect({
      ...image,
      formats: []
    }), []
  );
});

test("nothing readable, or bad input, gives an empty array and never throws", () => {
  const blank = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  assert.deepEqual(
    detectCodes({
      pixels: blank,
      width: 64,
      height: 64
    }), []
  );
  assert.deepEqual(
    detectCodes({
      pixels: blank,
      width: 0,
      height: 0
    }), []
  );
  assert.deepEqual(
    detectCodes({
      pixels: blank,
      width: 64,
      height: 640
    }), []
  );
  assert.deepEqual(
    detectCodes({
      pixels: blank,
      width: Number.NaN,
      height: 64
    }), []
  );
  assert.deepEqual(
    detectCodes({
      pixels: blank,
      width: 64,
      height: 64,
      region: {
        x: 1000,
        y: 1000,
        width: 5,
        height: 5
      }
    }), []
  );
  assert.deepEqual(
    detectCodes({
      pixels: blank,
      width: 64,
      height: 64,
      region: {
        x: -50,
        y: -50,
        width: Number.NaN,
        height: 20
      }
    }), []
  );
  const noise = new Uint8ClampedArray(120 * 90 * 4);
  let seed = 12345;
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    noise[i] = seed >> 16;
  }
  assert.deepEqual(
    detectCodes({
      pixels: noise,
      width: 120,
      height: 90
    }), []
  );
  assert.deepEqual(
    detectCodes({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- a caller outside the types may pass anything
      pixels: undefined as unknown as Uint8Array,
      width: 5,
      height: 5
    }), []
  );
});

const EAN_13 = `590123412345${checkDigitOf("590123412345")}`;
const EAN_13_PARITY_ZERO = `400638133393${checkDigitOf("400638133393")}`;
const UPC_A = `03600029145${checkDigitOf("03600029145")}`;
const EAN_8 = `9638507${checkDigitOf("9638507")}`;

function bars({ modules, scale, ...extra }: {
  readonly modules: readonly boolean[];
  readonly scale: number;
  readonly quarterTurns?: number;
  readonly quietModules?: number;
}) {
  return render({
    grid: gridFromBars({
      bars: modules,
      height: BAR_HEIGHT_MODULES
    }),
    scale,
    ...extra
  });
}

test("the check digit makers agree with known codes", () => {
  assert.equal(EAN_13, "5901234123457");
  assert.equal(UPC_A, "036000291452");
  assert.equal(EAN_8, "96385074");
});

test("EAN-13, UPC-A, EAN-8 and Code 128 are read", () => {
  const cases: ReadonlyArray<readonly [Symbology, string, readonly boolean[]]> = [
    [Symbology.EAN_13, EAN_13, encodeEan(EAN_13)],
    [Symbology.EAN_13, EAN_13_PARITY_ZERO, encodeEan(EAN_13_PARITY_ZERO)],
    [Symbology.UPC_A, UPC_A, encodeEan(UPC_A)],
    [Symbology.EAN_8, EAN_8, encodeEan(EAN_8)],
    [Symbology.CODE_128, "Hello-128", encodeCode128("Hello-128")],
    [Symbology.CODE_128, "1234567890", encodeCode128("1234567890")],
    [Symbology.CODE_128, "A", encodeCode128("A")]
  ];
  for (const [format, text, modules] of cases) {
    for (const scale of [1, 2, 3, 7]) {
      const code = only(
        detect(
          bars({
            modules,
            scale
          })
        )
      );
      assert.equal(code.format, format, `${text} at ${scale}`);
      assert.equal(code.text, text, `${text} at ${scale}`);
    }
  }
});

test("a linear code is read upside down and on its side, with bounds and corners", () => {
  const modules = encodeEan(EAN_13);
  for (const quarterTurns of [0, 1, 2, 3]) {
    const code = only(
      detect(
        bars({
          modules,
          scale: 3,
          quarterTurns
        })
      )
    );
    assert.equal(code.text, EAN_13, `turns ${quarterTurns}`);
    const isSideways = quarterTurns % 2 === 1;
    assert.equal(code.bounds.width, isSideways ? BAR_HEIGHT_MODULES * 3 : modules.length * 3, `width, turns ${quarterTurns}`);
    assert.equal(code.corners.length, 4);
  }
});

test("a linear code is found with no quiet zone, cropped to its bars", () => {
  const modules = encodeEan(EAN_13);
  const code = only(
    detect(
      bars({
        modules,
        scale: 3,
        quietModules: 0
      })
    )
  );
  assert.equal(code.text, EAN_13);
  assert.deepEqual(code.bounds, {
    x: 0,
    y: 0,
    width: modules.length * 3,
    height: BAR_HEIGHT_MODULES * 3
  });
  const crop = only(
    detect(
      bars({
        modules: encodeCode128("crop"),
        scale: 2,
        quietModules: 0
      })
    )
  );
  assert.equal(crop.text, "crop");
});

test("a linear code among clutter is found at its place in the image", () => {
  const modules = encodeEan(EAN_13);
  const symbol = bars({
    modules,
    scale: 2
  });
  const image = embed({
    image: symbol,
    width: 480,
    height: 300,
    offset: {
      x: 100,
      y: 120
    },
    fill: clutter
  });
  const code = only(
    detect({
      ...image,
      formats: [Symbology.EAN_13]
    })
  );
  assert.equal(code.text, EAN_13);
  assert.ok(code.bounds.x >= 100 && code.bounds.x + code.bounds.width <= 100 + symbol.width);
  assert.ok(code.bounds.y >= 120 && code.bounds.y + code.bounds.height <= 120 + symbol.height);
});

test("a corrupt check digit is not accepted, and a blurred symbol still reads", () => {
  const wrong = `${EAN_13.slice(0, 12)}${(Number(EAN_13.slice(12)) + 1) % 10}`;
  assert.deepEqual(
    detect(
      bars({
        modules: encodeEan(wrong),
        scale: 3
      })
    ), []
  );
  assert.equal(
    only(
      detect(
        blur({
          image: bars({
            modules: encodeEan(EAN_13),
            scale: 4
          }),
          radius: 1
        })
      )
    ).text, EAN_13
  );
});

test("the formats option decides how a UPC-A symbol is reported", () => {
  const image = bars({
    modules: encodeEan(UPC_A),
    scale: 3
  });
  assert.equal(
    only(
      detect({
        ...image,
        formats: [Symbology.UPC_A]
      })
    ).text, UPC_A
  );
  const asEan = only(
    detect({
      ...image,
      formats: [Symbology.EAN_13]
    })
  );
  assert.equal(asEan.format, Symbology.EAN_13);
  assert.equal(asEan.text, `0${UPC_A}`);
  assert.deepEqual(
    detect({
      ...image,
      formats: [Symbology.CODE_128, Symbology.EAN_8]
    }), []
  );
});
