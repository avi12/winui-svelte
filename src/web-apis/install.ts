/** Takes an installed API away again. */
export type Uninstall = () => void;

/** An `install...` function: defines an API and returns how to remove it. */
export type WebApiInstaller = () => Uninstall;

/**
 * Defines a property on an object (the global scope by default) and returns a
 * function that puts back what was there. Nothing is defined at import time:
 * every API is installed by an explicit call.
 *
 * @param options - The property's name and value, and the object to define it on.
 * @returns The function that restores the previous property, or removes this one.
 */
export function defineProperty({ name, value, target = globalThis }: {
  name: string;
  value: unknown;
  target?: object;
}) {
  const previous = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, {
    value,
    configurable: true,
    writable: true,
    enumerable: false
  });
  return () => {
    const isNew = previous === undefined;
    if (isNew) {
      // eslint-disable-next-line no-restricted-syntax -- the one typed way to delete a property of any object
      Reflect.deleteProperty(target, name);
      return;
    }

    Object.defineProperty(target, name, previous);
  };
}

/**
 * Defines a property on `navigator`, such as `geolocation`.
 *
 * @param options - The property's name and value.
 * @returns The function that takes it away again.
 * @throws {Error} When the runtime has no `navigator`.
 */
export function defineNavigatorProperty({ name, value }: {
  name: string;
  value: unknown;
}) {
  const hasNavigator = typeof navigator === "object";
  if (!hasNavigator) {
    throw new Error("this runtime has no navigator to define Web APIs on");
  }

  return defineProperty({
    name,
    value,
    target: navigator
  });
}

/**
 * Installs the listed Web APIs, and only those: nothing is installed
 * implicitly, so an app that lists none pays for none. Call it on the thread
 * the app's code runs on (the window thread; `runWindow`'s `webApis` option
 * does).
 *
 * @param options - The `install...` functions to run, in order.
 * @returns A function that uninstalls them all, last first.
 */
export function installWebApis({ apis }: {
  apis: readonly WebApiInstaller[];
}) {
  const uninstalls: Uninstall[] = [];
  for (const install of apis) {
    uninstalls.push(install());
  }

  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
