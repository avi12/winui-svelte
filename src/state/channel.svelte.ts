import { applyOps } from "./patch.ts";
import type { Json, StateProtocol } from "./protocol.ts";
import { MessageType, patchDataSchema, PatchOperation, snapshotDataSchema } from "./protocol.ts";
import type { Transport } from "./transports/transport.ts";
import { defineMessaging, MessagingClosedError } from "#src/messaging/index.js";
import type { Messaging } from "#src/messaging/index.js";

// The window's end of the state the host owns. `hostState({ channel, name:
// "view" })` is one reactive object: the host sends a snapshot, then patches,
// and each is applied in place, so only the bindings that read a changed
// property update. `channel.send(action)` returns a promise the host's answer
// settles. The channel is a typed messaging link (messaging/) with the state
// protocol's handlers registered; `channel.messaging` is that link, for an app
// to register handlers for, and send, message types of its own. The generic
// parameters are the app's own types (Edge+ generates them from Rust), which
// the channel cannot check at run time beyond "this is JSON": the host is
// trusted to send its declared shape.

/** What `HostChannel.send` rejects with when the host answered with an error. */
export class HostError extends Error {
  override readonly name = "HostError";
}

/** What `HostChannel.send` rejects with when the link to the host is gone. */
export class HostClosedError extends Error {
  override readonly name = "HostClosedError";
}

/** One named state the host owns, as the window sees it. */
export interface HostState<State extends Json> {
  /** The host's value, deeply reactive; undefined until the first snapshot. */
  readonly current: State | undefined;

  /** Whether the first snapshot has arrived. Reactive. */
  readonly isReady: boolean;

  /** Settles with the value once the first snapshot has arrived. */
  readonly ready: Promise<State>;
}

/** How a channel reacts to what it cannot use. */
export interface ChannelOptions {
  /**
   * The link to the host closed: the host is gone, or ended it. A window
   * process that has nothing to show without the host exits here
   * (`exitWhenHostEnds` in `winui-svelte/window`).
   */
  onClosed?(): void;

  /**
   * Anything wrong with what the host sent or with applying it, or a message
   * type nobody handles; the host's remedy is a new snapshot. Defaults to a
   * line on stderr (never stdout).
   */
  onError?(error: Error): void;
}

/** The link a channel is made over, and how it reacts. */
export interface HostChannelSetup extends ChannelOptions {
  transport: Transport;
}

/**
 * The window's end of a link to the host. `Action` is the type of what `send`
 * takes; `Extra` is a ProtocolMap of the app's own message types, added to the
 * state protocol's.
 */
export interface HostChannel<Action extends Json = Json, Extra extends object = object> {
  /** The state the host owns under `name`: reactive, and empty until its snapshot arrives. */
  state<State extends Json>(name: string): HostState<State>;

  /**
   * Sends an action. Resolves when the host did it; rejects with `HostError`
   * carrying its text when it could not, and with `HostClosedError` when the
   * link is gone.
   */
  send(action: Action): Promise<void>;

  /** The typed link underneath, for message types of the app's own. */
  readonly messaging: Messaging<StateProtocol<Action> & Extra>;

  /** Calls `listener` once the link to the host has closed (at once if it already has). */
  onClosed(listener: () => void): void;

  /** Closes the link; what is still waiting rejects. */
  dispose(): void;
}

class StateSlot<State extends Json> implements HostState<State> {
  // The cell is the deep proxy; the root sits in it so a snapshot of a
  // different shape can still replace it.
  readonly cell: { current: State | undefined } = $state({ current: undefined });
  private hasSnapshot = $state(false);
  private readonly settled = Promise.withResolvers<State>();

  get current() {
    return this.cell.current;
  }

  get isReady() {
    return this.hasSnapshot;
  }

  get ready() {
    return this.settled.promise;
  }

  receiveSnapshot(value: Json) {
    // Written through patch.ts's untyped holder: the host's value is trusted
    // to be State.
    applyOps({
      holder: this.cell,
      ops: [{
        op: PatchOperation.set,
        path: [],
        value
      }]
    });
    this.hasSnapshot = true;

    const { current } = this.cell;
    const hasValue = current !== undefined;
    if (hasValue) {
      this.settled.resolve(current);
    }
  }
}

function writeToStderr(error: Error) {
  process.stderr.write(
    `[winui-svelte] ${error.message}
`
  );
}

class Channel<Action extends Json, Extra extends object> implements HostChannel<Action, Extra> {
  readonly messaging: Messaging<StateProtocol<Action> & Extra>;
  // The same link seen as the state protocol alone, which TypeScript can
  // resolve while Action and Extra are still open.
  private readonly own: Messaging<StateProtocol>;
  // Typed by whoever asks first: the one place the app's own State type
  // meets the wire (an `instanceof` hands the slot back as that State).
  private readonly slots = new Map<string, object>();
  private isClosed = false;
  private readonly closedListeners: Array<() => void> = [];

  constructor({ transport, onError = writeToStderr, onClosed }: HostChannelSetup) {
    this.messaging = defineMessaging<StateProtocol<Action> & Extra>({
      transport,
      onError,
      onClosed: () => {
        this.isClosed = true;
        onClosed?.();
        for (const listener of this.closedListeners.splice(0)) {
          listener();
        }
      },
      onUnhandled: frame => onError(new Error(`no handler for message "${frame.type}"`))
    });
    this.own = this.messaging;
    this.own.onMessage(MessageType.snapshot, message => this.receiveSnapshot(message.data));
    this.own.onMessage(MessageType.patch, message => this.receivePatch(message.data));
  }

  state<State extends Json>(name: string) {
    return this.slotFor<State>(name);
  }

  private slotFor<State extends Json>(name: string) {
    const existing = this.slots.get(name);
    const isExisting = existing instanceof StateSlot;
    if (isExisting) {
      const known: StateSlot<State> = existing;
      return known;
    }

    const slot = new StateSlot<State>();
    this.slots.set(name, slot);
    return slot;
  }

  async send(action: Action) {
    if (this.isClosed) {
      throw new HostClosedError("the host is gone");
    }

    try {
      await this.own.sendMessage(MessageType.action, action);
    } catch (error) {
      const isLinkClosed = error instanceof MessagingClosedError;
      if (isLinkClosed) {
        this.isClosed = true;
        throw new HostClosedError("the host closed before it replied");
      }

      throw new HostError(error instanceof Error ? error.message : String(error));
    }
  }

  onClosed(listener: () => void) {
    if (this.isClosed) {
      listener();
      return;
    }

    this.closedListeners.push(listener);
  }

  dispose() {
    this.isClosed = true;
    this.messaging.close();
  }

  private receiveSnapshot(data: Json) {
    const snapshot = snapshotDataSchema.safeParse(data);
    if (!snapshot.success) {
      throw new Error("a snapshot was malformed");
    }

    this.slotFor<Json>(snapshot.data.name).receiveSnapshot(snapshot.data.value);
  }

  private receivePatch(data: Json) {
    const patch = patchDataSchema.safeParse(data);
    if (!patch.success) {
      throw new Error("a patch was malformed");
    }

    const slot = this.slots.get(patch.data.name);
    const hasSnapshot = slot instanceof StateSlot && slot.isReady;
    if (!hasSnapshot) {
      throw new Error(`a patch for "${patch.data.name}" arrived before its snapshot`);
    }

    applyOps({
      holder: slot.cell,
      ops: patch.data.ops
    });
  }
}

/**
 * The window's end of a link to the host, over `transport`. The host sends
 * snapshots and patches of the states it owns; read one with `hostState`.
 */
export function createHostChannel<Action extends Json = Json, Extra extends object = object>(
  setup: HostChannelSetup
) {
  const channel: HostChannel<Action, Extra> = new Channel<Action, Extra>(setup);
  return channel;
}

/**
 * The state the host owns under `name`: one reactive object, empty until the
 * host's first snapshot. `State` is the app's own type for it.
 */
export function hostState<State extends Json>({ channel, name }: {
  channel: HostChannel<never, object>;
  name: string;
}) {
  return channel.state<State>(name);
}
