// The bindings project each WinRT overload as a method `_name_N` and choose
// among them from the arguments' count and JavaScript types alone. Two
// overloads that differ only in a struct or a runtime class (a Color or a brush,
// a Vector2 or two numbers) look the same to that choice, so the public
// `fillRectangle(x, y, w, h, brush)` calls the Color one. These find the
// overload by the parameter names the metadata gives it, which stay when the
// numbering changes.

const PARAMETER_LIST = /^\s*[\w$]+\(([^)]*)\)/u;
const overloadsByKey = new Map<string, unknown>();

function parametersOf(overload: unknown) {
  const isFunction = typeof overload === "function";
  if (!isFunction) {
    return [];
  }

  const names = PARAMETER_LIST.exec(Function.prototype.toString.call(overload))?.[1] ?? "";
  return names.split(",").map(name => name.trim()).filter(name => name !== "");
}

function isSameList({ left, right }: {
  left: string[];
  right: string[];
}) {
  return left.length === right.length && left.every((name, i) => name === right[i]);
}

/**
 * Calls the overload of `method` whose parameters have exactly these names, in
 * this order (as the bindings' `_method_N` declare them), on `target`.
 *
 * @throws {Error} when the bindings have no such overload
 */
export function callOverload({ target, method, parameters, args }: {
  target: object;
  method: string;
  parameters: string[];
  args: unknown[];
}) {
  const prototype = Object.getPrototypeOf(target);
  const key = `${prototype?.constructor?.name}.${method}(${parameters.join(",")})`;
  let overload = overloadsByKey.get(key);
  if (overload === undefined) {
    const candidates = Object.getOwnPropertyNames(prototype).filter(name => name.startsWith(`_${method}_`));
    const found = candidates.find(name => isSameList({
      left: parametersOf(Reflect.get(prototype, name)),
      right: parameters
    }));
    if (found === undefined) {
      throw new Error(`${key} is not among the overloads of the bindings`);
    }

    overload = Reflect.get(prototype, found);
    overloadsByKey.set(key, overload);
  }

  const isCallable = typeof overload === "function";
  if (!isCallable) {
    throw new Error(`${key} is not a function`);
  }

  return Reflect.apply(overload, target, args);
}
