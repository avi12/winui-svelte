import { defineMessaging } from "winui-svelte/messaging";
import { MemoryEnd } from "winui-svelte/state";
import { diff, MessageType } from "winui-svelte/state/host";
import type { Json, StateProtocol } from "winui-svelte/state/host";

// A host that owns one named state in the same process as the window, over an
// in-memory link: the shape of a Rust, Electron or Node host, without a second
// process. The reducer decides what an action does (a throw refuses it), and
// every change is sent as a patch.

/** What a host needs to own a state. */
export interface MemoryHostOptions<State extends Json> {
  name: string;
  initial: State;
  /** The state after `action`, or a thrown error when the host refuses it. */
  reduce(options: {
    state: State;
    action: Json;
  }): State;
  /** Told each new state, to persist it. */
  onChange?(state: State): void;
}

/** Starts the host and returns the window's end of the link, for `createHostChannel`. */
export function startMemoryHost<State extends Json>({ name, initial, reduce, onChange }: MemoryHostOptions<State>) {
  const [windowEnd, hostEnd] = MemoryEnd.pair();
  const messaging = defineMessaging<StateProtocol>({
    transport: hostEnd,
    onError: error => process.stderr.write(`host: ${error.message}\n`)
  });
  let state = initial;
  messaging.onMessage(MessageType.action, message => {
    const next = reduce({
      state,
      action: message.data
    });
    void messaging.sendMessage(MessageType.patch, {
      name,
      ops: diff({
        previous: state,
        next
      })
    });
    state = next;
    onChange?.(next);
  });
  void messaging.sendMessage(MessageType.snapshot, {
    name,
    value: state
  });
  return windowEnd;
}
