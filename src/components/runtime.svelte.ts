import type { Snippet } from "svelte";

// What a generated component links its control to its props with. A prop
// becomes an effect that writes the control's property when it changes; an
// event prop becomes one subscription for the control's life; a bindable
// property also listens to the control and writes the user's change back.

type Unsubscribe = () => void;
type Subscribe = (handler: () => void) => Unsubscribe;

// A value a prop can hold once `undefined` (the prop was not given) is out:
// what `value !== undefined` narrows to. (`NonNullable<unknown>` is `{}`.)
type Given<Value> = Value & (NonNullable<unknown> | null);

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
    apply: (value: Given<Props[Key]>) => void;
  }) {
    const isGiven = key in props;
    if (isGiven) {
      $effect(() => {
        const value = props[key];
        const isSet = value !== undefined;
        if (isSet) {
          this.write(() => apply(value));
        }
      });
    }
  }

  /** The property the children are: a child, when there is one, is the value. */
  contentProperty<Props extends { children?: Snippet }, Key extends keyof Props>({ props, key, apply }: {
    props: Props;
    key: Key;
    apply: (value: Given<Props[Key]>) => void;
  }) {
    const isGiven = key in props;
    if (isGiven) {
      $effect(() => {
        const value = props[key];
        const hasChildren = props.children !== undefined;
        const isWritable = value !== undefined && !hasChildren;
        if (isWritable) {
          this.write(() => apply(value));
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
        this.write(() => access.write(value));
      }
    });
    for (const subscribe of subscribers) {
      this.add(
        subscribe(() => this.changedByUser({
          bound,
          key,
          read: access.read
        }))
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

  private write(action: () => void) {
    const isAlreadyWriting = this.isWriting;
    this.isWriting = true;
    try {
      action();
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
