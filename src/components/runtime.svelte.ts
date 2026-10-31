import { enumValue } from "./convert.ts";
import type { FlagsInput } from "./convert.ts";
import type { AttachedModules } from "./generated/attached/owners.ts";
import { guarded, reportUiError } from "#src/ui-errors.js";
import type { Snippet } from "svelte";

// What a generated component links its control to its props with. A prop
// becomes an effect that writes the control's property when it changes; an
// event prop becomes one subscription for the control's life; a bindable
// property also listens to the control and writes the user's change back.

type Unsubscribe = () => void;
type Subscribe = (handler: () => void) => Unsubscribe;

type EnumTable = Record<string, number>;

function isEnumTable(table: object | undefined): table is EnumTable {
  return table !== undefined && Object.values(table).every(member => typeof member === "number");
}

function isEnumInput(value: unknown): value is FlagsInput<EnumTable> {
  return typeof value === "string" || typeof value === "number" || Array.isArray(value);
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

// eslint-disable-next-line no-restricted-syntax -- a type predicate cannot destructure its subject
function isKeyOf<Target extends object>(target: Target, key: PropertyKey): key is keyof Target {
  return key in target;
}

const loadedOwners: Partial<AttachedModules> = {};

/**
 * Records the module an attached owner's properties are written through.
 *
 * @param options - The owner's name (`Canvas`) and its module.
 */
export function rememberOwner<Name extends keyof AttachedModules>({ name, module }: {
  name: Name;
  module: AttachedModules[Name];
}) {
  loadedOwners[name] = module;
}

// A value a prop can hold once `undefined` (the prop was not given) is out:
// what `value !== undefined` narrows to. (`NonNullable<unknown>` is `{}`.)
type Given<Value> = Value & (NonNullable<unknown> | null);
// What a prop's effect writes: a given value that is not a snippet.
type Written<Value> = Given<Exclude<Value, Snippet>>;

// The props that name a property of the control that takes what they give.
type PlainKey<Props, Target> = {
  [Key in keyof Props & keyof Target]-?: Written<Props[Key]> extends Target[Key] ? Key : never;
}[keyof Props & keyof Target];

/**
 * Whether a prop holds a snippet, which the component renders in a
 * `<property>` element that fills the property, rather than a value.
 */
export function isSnippet(value: unknown): value is Snippet {
  return typeof value === "function";
}

// A prop's value that is written to the control: not a snippet.
function isValue<Value>(value: Value): value is Exclude<Value, Snippet> {
  return !isSnippet(value);
}

/** How a bindable property is read from its control and written to it. */
interface Access<Value> {
  read: () => Value;
  write: (value: Given<Value>) => void;
}

/** Links one control to the props of the component that renders it, and unlinks it. */
export class Linker {
  private readonly cleanups: Unsubscribe[] = [];
  // True while this class writes a property, so the change event that write
  // raises is not taken for the user's.
  private isWriting = false;

  /** Runs `cleanup` when the control is unlinked. */
  add(cleanup: Unsubscribe) {
    this.cleanups.push(cleanup);
  }

  /**
   * Props given when the component is made get an effect each; a prop that
   * appears later is not followed (a spread that adds keys is not tracked).
   */
  property<Props extends object, Key extends keyof Props>({ props, key, apply }: {
    props: Props;
    key: Key;
    apply: (value: Written<Props[Key]>) => void;
  }) {
    this.follow({
      props,
      key,
      apply,
      isBlocked: () => false
    });
  }

  /**
   * Props the control takes as they are, each in the property of its name:
   * the same effect as `property` for each, from a list of names instead of
   * a function apiece, which a bundle of one control carries for every
   * property its classes have.
   */
  plain<Props extends object, Target extends object>({ props, control, keys }: {
    props: Props;
    control: Target;
    keys: ReadonlyArray<PlainKey<Props, Target>>;
  }) {
    for (const key of keys) {
      this.follow({
        props,
        key,
        apply(value) {
          Object.assign(control, { [key]: value });
        },
        isBlocked: () => false
      });
    }
  }

  /**
   * Props that take an enum's member by name or value (or, for flags, a list
   * of names), each written to the property of its name through the enum's
   * table: one call for the enum props of a class, not a function apiece.
   */
  enums<Props extends object, Target extends object>({ props, control, tables }: {
    props: Props;
    control: Target;
    tables: { [Key in keyof Props & keyof Target]?: Readonly<Record<string, Target[Key]>> };
  }) {
    for (const key of Object.keys(tables)) {
      const isTabled = isKeyOf(tables, key);
      if (isTabled) {
        this.followEnum({
          props,
          control,
          key,
          table: tables[key]
        });
      }
    }
  }

  private followEnum<
    Props extends object,
    Target extends object,
    Key extends keyof Props & keyof Target
  >({ props, control, key, table }: {
    props: Props;
    control: Target;
    key: Key;
    table: Readonly<Record<string, Target[Key]>> | undefined;
  }) {
    this.follow({
      props,
      key,
      apply(input) {
        const isConvertible = isEnumInput(input) && isEnumTable(table);
        if (isConvertible) {
          Object.assign(control, {
            [key]: enumValue<EnumTable>({
              table,
              input,
              prop: String(key)
            })
          });
        }
      },
      isBlocked: () => false
    });
  }

  /**
   * An event prop: the app's handler is called for each raise of the event
   * `subscribe` listens to, for the control's life. What the handler throws
   * is reported (ui-errors.ts) and does not reach WinUI.
   */
  event<Props extends object, Key extends keyof Props, Args extends unknown[]>({ props, key, subscribe }: {
    props: Props;
    key: Key;
    subscribe: (handler: (...args: Args) => void) => Unsubscribe;
  }) {
    const isGiven = key in props;
    if (!isGiven) {
      return;
    }

    this.add(
      subscribe(
        guarded({
          origin: `event "${String(key)}"`,
          callback(...args: Args) {
            const handler: unknown = props[key];
            if (isCallable(handler)) {
              handler(...args);
            }
          }
        })
      )
    );
  }

  /**
   * The attached properties of one owner, each written through the module
   * the app has loaded under `owner`'s name (`rememberOwner`): the compiler
   * has a component whose markup names such a prop load its owner first, so
   * an app that sets none never loads an owner's bindings, and the control
   * has its place when WinUI first lays it out.
   */
  attached<Props extends object, Name extends keyof AttachedModules>({ props, owner, setters }: {
    props: Props;
    owner: Name;
    setters: { [Key in keyof Props]?: (owner: AttachedModules[Name], value: Written<Props[Key]>) => void };
  }) {
    for (const key of Object.keys(setters)) {
      const isSetter = isKeyOf(setters, key);
      if (isSetter) {
        this.followAttached({
          props,
          key,
          owner,
          apply: setters[key]
        });
      }
    }
  }

  private followAttached<
    Props extends object,
    Key extends keyof Props,
    Name extends keyof AttachedModules
  >({ props, key, owner, apply }: {
    props: Props;
    key: Key;
    owner: Name;
    apply: ((owner: AttachedModules[Name], value: Written<Props[Key]>) => void) | undefined;
  }) {
    this.property({
      props,
      key,
      apply(value) {
        const loaded = loadedOwners[owner];
        const isLoaded = loaded !== undefined;
        if (!isLoaded) {
          throw new Error(`${String(key)} needs the ${owner} module: name the prop in a .svelte file, or await preloadAttachedOwners(["${owner}"])`);
        }

        apply?.(loaded, value);
      }
    });
  }

  /** The property the children are: a child, when there is one, is the value. */
  contentProperty<Props extends { children?: Snippet }, Key extends keyof Props>({ props, key, apply }: {
    props: Props;
    key: Key;
    apply: (value: Written<Props[Key]>) => void;
  }) {
    this.follow({
      props,
      key,
      apply,
      isBlocked: () => props.children !== undefined
    });
  }

  // The effect both kinds of property share: the prop's value is written to
  // the control unless it is unset, a snippet (a <property> element fills the
  // property) or `isBlocked` (read inside the effect, so it is tracked) says
  // something else holds the value.
  private follow<Props extends object, Key extends keyof Props>({ props, key, apply, isBlocked }: {
    props: Props;
    key: Key;
    apply: (value: Written<Props[Key]>) => void;
    isBlocked: () => boolean;
  }) {
    const isGiven = key in props;
    if (isGiven) {
      $effect(() => {
        const value = props[key];
        const isWritable = isValue(value) && value !== undefined && !isBlocked();
        if (isWritable) {
          this.write({
            origin: `prop "${String(key)}"`,
            action: () => apply(value)
          });
        }
      });
    }
  }

  /**
   * A property the app binds: the prop's value is written to the control, and
   * a change the user makes through `subscribers`' events is written back.
   */
  bindable<Bound extends object, Key extends keyof Bound>({ bound, key, access, subscribers }: {
    bound: Bound;
    key: Key;
    access: Access<Bound[Key]>;
    subscribers: readonly Subscribe[];
  }) {
    $effect(() => {
      const value = bound[key];
      const isSet = value !== undefined;
      if (isSet) {
        this.write({
          origin: `bound prop "${String(key)}"`,
          action: () => access.write(value)
        });
      }
    });
    for (const subscribe of subscribers) {
      this.add(
        subscribe(
          guarded({
            origin: `change of bound prop "${String(key)}"`,
            callback: () => this.changedByUser({
              bound,
              key,
              read: access.read
            })
          })
        )
      );
    }
  }

  private changedByUser<Bound extends object, Key extends keyof Bound>({ bound, key, read }: {
    bound: Bound;
    key: Key;
    read: () => Bound[Key];
  }) {
    if (this.isWriting) {
      return;
    }

    const current = read();
    const isChanged = current !== bound[key];
    if (isChanged) {
      bound[key] = current;
    }
  }

  // A property the control refuses is reported, not thrown: the effect that
  // writes it runs inside a flush that native code is waiting on.
  private write({ origin, action }: {
    origin: string;
    action: () => void;
  }) {
    const isAlreadyWriting = this.isWriting;
    this.isWriting = true;
    try {
      action();
    } catch (error) {
      reportUiError({
        error,
        origin
      });
    } finally {
      this.isWriting = isAlreadyWriting;
    }
  }

  /** Unlinks the control: every subscription ends. */
  dispose() {
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
  }
}
