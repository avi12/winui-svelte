// The bindings project each WinRT overload as a method `_name_N` and choose
// among them from the arguments' count and JavaScript types alone. Two
// overloads that differ only in a struct or a runtime class (a Color or a brush,
// a Vector2 or two numbers) look the same to that choice, so the public
// `fillRectangle(x, y, w, h, brush)` calls the Color one. These find the
// overload by the parameter names the metadata gives it, which stay when the
// numbering changes.

type Overload = (this: object, ...args: unknown[]) => unknown;

const PARAMETER_LIST = /^\s*[\w$]+\(([^)]*)\)/u;
const overloadsByKey = new Map<string, Overload>();

function isOverload(value: unknown): value is Overload {
  return typeof value === "function";
}

function methodOf({ prototype, name }: {
  prototype: object;
  name: string;
}) {
  return Object.getOwnPropertyDescriptor(prototype, name)?.value;
}

function parametersOf(overload: unknown) {
  if (!isOverload(overload)) {
    return [];
  }

  const names = PARAMETER_LIST.exec(overload.toString())?.[1] ?? "";
  return names.split(",").map(name => name.trim()).filter(name => name !== "");
}

function isSameList({ left, right }: {
  left: string[];
  right: string[];
}) {
  return left.length === right.length && left.every((name, i) => name === right[i]);
}

function findOverload({ prototype, method, parameters }: {
  prototype: object;
  method: string;
  parameters: string[];
}) {
  const candidates = Object.getOwnPropertyNames(prototype).filter(name => name.startsWith(`_${method}_`));
  const found = candidates.find(name => isSameList({
    left: parametersOf(
      methodOf({
        prototype,
        name
      })
    ),
    right: parameters
  }));
  const candidate = found === undefined ? undefined : methodOf({
    prototype,
    name: found
  });
  if (!isOverload(candidate)) {
    throw new Error(`${method}(${parameters.join(",")}) is not among the overloads of the bindings`);
  }

  return candidate;
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
  const key = `${prototype.constructor.name}.${method}(${parameters.join(",")})`;
  const known = overloadsByKey.get(key);
  const overload = known ?? findOverload({
    prototype,
    method,
    parameters
  });
  overloadsByKey.set(key, overload);
  return overload.apply(target, args);
}
