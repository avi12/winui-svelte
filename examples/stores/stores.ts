import { metered, meteredWritable } from "./metered.ts";
import { derived, readable, writable } from "svelte/store";
import { startTimer } from "winui-svelte/window";

const CLOCK_INTERVAL_MILLISECONDS = 50;
const STEP = 5;
const INITIAL_AMOUNT = 3;

export const CONTEXT_KEY = Symbol("label");

export function createStores() {
  const count = meteredWritable(writable(0));
  const clock = metered(
    readable(0, set => {
      let ticks = 0;
      return startTimer({
        milliseconds: CLOCK_INTERVAL_MILLISECONDS,
        isRepeating: true,
        onTick() {
          ticks++;
          set(ticks);
        }
      });
    })
  );
  const double = metered(derived(count, value => value * 2));
  const amount = meteredWritable(writable(INITIAL_AMOUNT));
  const sum = metered(derived([count, amount], ([first, second]) => first + second));
  const name = meteredWritable(writable("Ada"));
  const isEnabled = meteredWritable(writable(false));
  const items = meteredWritable(writable<string[]>([]));
  const label = meteredWritable(writable("from context"));
  const stepper = createStepper();
  return {
    count,
    clock,
    double,
    amount,
    sum,
    name,
    isEnabled,
    items,
    label,
    stepper
  };
}

function createStepper() {
  const inner = writable(0);
  return {
    subscribe: inner.subscribe,
    increment: () => inner.update(value => value + STEP)
  };
}
