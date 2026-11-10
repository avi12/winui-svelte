import { findAlignment } from "./qr-alignment.ts";
import { decodeQrMatrix } from "./qr-decode.ts";
import type { Triple } from "./qr-triples.ts";
import type { Point } from "#src/barcode/barcode-types.js";
import { BitMatrix } from "#src/barcode/bit-matrix.js";
import type { Homography } from "#src/barcode/homography.js";
import { applyHomography, createHomography } from "#src/barcode/homography.js";

const FINDER_CENTER = 3.5;
const FINDER_SPAN = 7;
const ALIGNMENT_CENTER_FROM_EDGE = 6.5;
const FIRST_VERSION_DIMENSION = 21;
const HALF_MODULE = 0.5;

function sampleGrid({ matrix, dimension, homography }: {
  readonly matrix: BitMatrix;
  readonly dimension: number;
  readonly homography: Homography;
}) {
  const grid = new BitMatrix({
    width: dimension,
    height: dimension
  });
  for (let row = 0; row < dimension; row++) {
    for (let column = 0; column < dimension; column++) {
      const point = applyHomography({
        homography,
        point: {
          x: column + HALF_MODULE,
          y: row + HALF_MODULE
        }
      });
      const isBlack = matrix.isBlackAt({
        x: Math.floor(point.x),
        y: Math.floor(point.y)
      });
      if (isBlack) {
        grid.setBlack({
          x: column,
          y: row
        });
      }
    }
  }
  return grid;
}

function pointAlong({ origin, vectors, modules }: {
  readonly origin: Point;
  readonly vectors: {
    readonly across: Point;
    readonly down: Point;
  };
  readonly modules: number;
}) {
  return {
    x: origin.x + modules * (vectors.across.x + vectors.down.x),
    y: origin.y + modules * (vectors.across.y + vectors.down.y)
  };
}

// The grid point and the image point that pin down the symbol's fourth corner: the alignment
// pattern where the version has one and it is found, otherwise the corner an affine guess gives.
function fourthPoints({ matrix, triple, dimension }: {
  readonly matrix: BitMatrix;
  readonly triple: Triple;
  readonly dimension: number;
}) {
  const { topLeft, topRight, bottomLeft } = triple;
  const span = dimension - FINDER_SPAN;
  const vectors = {
    across: {
      x: (topRight.x - topLeft.x) / span,
      y: (topRight.y - topLeft.y) / span
    },
    down: {
      x: (bottomLeft.x - topLeft.x) / span,
      y: (bottomLeft.y - topLeft.y) / span
    }
  };
  const farCenter = dimension - FINDER_CENTER;
  const corner = {
    grid: {
      x: farCenter,
      y: farCenter
    },
    image: pointAlong({
      origin: topLeft,
      vectors,
      modules: farCenter - FINDER_CENTER
    })
  };
  const hasAlignment = dimension > FIRST_VERSION_DIMENSION;
  const alignmentCenter = dimension - ALIGNMENT_CENTER_FROM_EDGE;
  const alignment = hasAlignment
    ? findAlignment({
      matrix,
      estimate: pointAlong({
        origin: topLeft,
        vectors,
        modules: alignmentCenter - FINDER_CENTER
      }),
      vectors
    })
    : undefined;
  return alignment
    ? [
      {
        grid: {
          x: alignmentCenter,
          y: alignmentCenter
        },
        image: alignment
      },
      corner
    ]
    : [corner];
}

/**
 * Samples the symbol that three finder patterns outline, at the given side in
 * modules, and decodes it (also as a mirror image); returns its text and the
 * symbol's four corners in the image, or `undefined`.
 */
export function decodeAt({ matrix, triple, dimension }: {
  readonly matrix: BitMatrix;
  readonly triple: Triple;
  readonly dimension: number;
}) {
  const { topLeft, topRight, bottomLeft } = triple;
  const farCenter = dimension - FINDER_CENTER;
  const pinned = [
    {
      grid: {
        x: FINDER_CENTER,
        y: FINDER_CENTER
      },
      image: topLeft
    },
    {
      grid: {
        x: farCenter,
        y: FINDER_CENTER
      },
      image: topRight
    },
    {
      grid: {
        x: FINDER_CENTER,
        y: farCenter
      },
      image: bottomLeft
    }
  ];
  for (const fourth of fourthPoints({
    matrix,
    triple,
    dimension
  })) {
    const points = [...pinned, fourth];
    const homography = createHomography({
      from: points.map(point => point.grid),
      to: points.map(point => point.image)
    });
    const grid = homography && sampleGrid({
      matrix,
      dimension,
      homography
    });
    const text = grid && (decodeQrMatrix(grid) ?? decodeQrMatrix(grid.transposed()));
    const isDecoded = homography && text !== undefined;
    if (isDecoded) {
      const corners = [
        {
          x: 0,
          y: 0
        },
        {
          x: dimension,
          y: 0
        },
        {
          x: dimension,
          y: dimension
        },
        {
          x: 0,
          y: dimension
        }
      ].map(point => applyHomography({
        homography,
        point
      }));
      return {
        text,
        corners
      };
    }
  }
  return undefined;
}
