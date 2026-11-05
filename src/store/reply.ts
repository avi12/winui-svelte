/**
 * What a call that needs a package identity answers: the value, or
 * `hasPackage: false` when this process runs outside a package (plain
 * Node.js, Electron, `pnpm dev`). It never throws for the missing identity.
 */
export type PackageReply<T> =
  | {
    readonly hasPackage: true;
    readonly value: T;
  }
  | {
    readonly hasPackage: false;
  };

/** The answer of a call made outside a package. */
export const NO_PACKAGE = { hasPackage: false } as const satisfies PackageReply<never>;

/**
 * Wraps a value as the answer of a call made inside a package.
 *
 * @param value - The result.
 * @returns The reply.
 */
export function packaged<T>(value: T) {
  return {
    hasPackage: true,
    value
  } as const satisfies PackageReply<T>;
}
