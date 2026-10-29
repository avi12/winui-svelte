const LAYER_SEPARATOR = ".";

/**
 * The cascade layers of a sheet (`@layer base, components;` and `@layer base {}`):
 * a layer's place is where its name first appears, a later layer beats an
 * earlier one, and a rule outside every layer beats them all. Nested layers are
 * named `outer.inner`.
 */
export interface LayerOrder {
  names: string[];
  /** The layer being read, or null outside any. */
  current: string | null;
  anonymous: number;
}

/** A sheet's layers before any is named. */
export function createLayerOrder() {
  return {
    names: [],
    current: null,
    anonymous: 0
  } satisfies LayerOrder;
}

/** Puts a layer in order if it is not yet (a `@layer a, b;` statement), under the current one. */
export function declareLayer({ order, name }: {
  order: LayerOrder;
  name: string;
}) {
  const full = order.current === null ? name : `${order.current}${LAYER_SEPARATOR}${name}`;
  const isKnown = order.names.includes(full);
  if (!isKnown) {
    order.names.push(full);
  }

  return full;
}

/** Reads `body` inside the layer `name` (an empty name is an anonymous layer). */
export function withinLayer({ order, name, body }: {
  order: LayerOrder;
  name: string;
  body(): void;
}) {
  const outer = order.current;
  order.current = declareLayer({
    order,
    name: name === "" ? `#${order.anonymous++}` : name
  });
  try {
    body();
  } finally {
    order.current = outer;
  }
}

/** The place of a layer from the weakest. */
export function layerRank({ order, name }: {
  order: LayerOrder;
  name: string;
}) {
  return order.names.indexOf(name);
}
