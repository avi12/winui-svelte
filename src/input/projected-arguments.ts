import { projectAs, releaseProjected } from "#winui/lifetime";

// WinUI hands a handler the arguments of an event as the base class the event
// is declared with, which has none of the members of the routed arguments the
// pointer or key event really carries (`getCurrentPoint`, `keyStatus`): they
// are there only once the arguments are read as that class. Reading the
// members off what the handler got finds nothing, so the event was dropped.

type Projection<Args extends object> = Parameters<typeof projectAs<Args>>[1];

function hasMember<Args extends object>({ value, member }: {
  value: object;
  member: string;
}): value is Args {
  return member in value;
}

/**
 * Reads the arguments of an event as the class it carries, for the length of
 * `use`.
 *
 * @param options - The arguments, the class to read them as, and what is done with them.
 * @returns What `use` returned; arguments that already are the class (a test's
 *     fake) are passed on as they are.
 */
export function withProjected<Args extends object, Result>({ args, projection, member, use }: {
  args: unknown;
  projection: Projection<Args>;
  member: string;
  use: (projected: Args) => Result;
}) {
  const isObject = typeof args === "object" && args !== null;
  if (!isObject) {
    return undefined;
  }

  if (hasMember<Args>({
    value: args,
    member
  })) {
    return use(args);
  }

  const isProjectable = "_obj" in args;
  if (!isProjectable) {
    return undefined;
  }

  const projected = projectAs(args, projection);
  try {
    return use(projected);
  } finally {
    releaseProjected(projected);
  }
}
