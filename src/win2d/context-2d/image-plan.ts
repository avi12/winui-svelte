// What drawImage's three forms mean: which part of the image goes where.

const POINT_NUMBERS = 2;
const SIZED_NUMBERS = 4;
const CROPPED_NUMBERS = 8;

/** A rectangle in pixels. */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectangleFrom([x = 0, y = 0, width = 0, height = 0]: number[]) {
  return {
    x,
    y,
    width,
    height
  } satisfies Rectangle;
}

function destinationNumbers({ given, image }: {
  given: number[];
  image: Rectangle;
}) {
  const isCropped = given.length === CROPPED_NUMBERS;
  if (isCropped) {
    return given.slice(SIZED_NUMBERS);
  }

  const isSized = given.length === SIZED_NUMBERS;
  return isSized ? given : [...given, image.width, image.height];
}

/**
 * The part of an image and the rectangle it is drawn into, from the numbers
 * drawImage was given (a point; a point and a size; or a source rectangle and
 * a destination rectangle). Undefined when nothing would be drawn: a number is
 * not finite, or a rectangle is empty, or the source is outside the image.
 *
 * @throws {RangeError} when the numbers are not two, four or eight
 */
export function planImage({ image, numbers }: {
  image: Rectangle;
  numbers: (number | undefined)[];
}) {
  const given = numbers.filter(value => value !== undefined);
  const isCropped = given.length === CROPPED_NUMBERS;
  const isSized = given.length === SIZED_NUMBERS;
  const isPoint = given.length === POINT_NUMBERS;
  const isForm = isCropped || isSized || isPoint;
  if (!isForm) {
    throw new RangeError("drawImage takes three, five or nine arguments");
  }

  const source = isCropped ? rectangleFrom(given) : image;
  const destination = rectangleFrom(
    destinationNumbers({
      given,
      image
    })
  );
  const isFinite = given.every(Number.isFinite);
  const isEmpty = source.width === 0 || source.height === 0 || destination.width === 0 || destination.height === 0;
  const isNothing = !isFinite || isEmpty;
  if (isNothing) {
    return undefined;
  }

  return clippedCopy({
    source,
    destination,
    image
  });
}

// The part of a source rectangle inside the image, and the destination it maps to.
function clippedCopy({ source, destination, image }: {
  source: Rectangle;
  destination: Rectangle;
  image: Rectangle;
}) {
  const left = Math.max(source.x, image.x);
  const top = Math.max(source.y, image.y);
  const right = Math.min(source.x + source.width, image.x + image.width);
  const bottom = Math.min(source.y + source.height, image.y + image.height);
  const isOutside = right <= left || bottom <= top;
  if (isOutside) {
    return undefined;
  }

  const scaleX = destination.width / source.width;
  const scaleY = destination.height / source.height;
  return {
    source: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    },
    destination: {
      x: destination.x + (left - source.x) * scaleX,
      y: destination.y + (top - source.y) * scaleY,
      width: (right - left) * scaleX,
      height: (bottom - top) * scaleY
    }
  };
}
