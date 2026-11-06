import type { DisplayStatus, EffectivePowerMode, UserPresenceStatus } from "./bindings.ts";
import { SessionPowerManager } from "./bindings.ts";
import type { Subscription } from "./subscription.ts";

const POLL_MILLISECONDS = 1000;
const WAKE_GAP_MILLISECONDS = 10_000;

/** The session and power state of the machine at one moment. */
export interface SystemPowerReading {
  /** The monitors: on, dimmed or off. */
  readonly displayStatus: DisplayStatus;

  /** The power mode the system runs in, which the power slider and the battery saver set. */
  readonly effectivePowerMode: EffectivePowerMode;

  /** Whether the user is at the machine; any value but `Present` or `Absent` means Windows has not said yet. */
  readonly userPresenceStatus: UserPresenceStatus;

  /** How many times the machine has woken from sleep since the source began to be watched. */
  readonly resumeCount: number;
}

/** The reads and ticks `systemPower` and the page API use; a test stands in for them. */
export interface SystemPowerSource {
  read(): SystemPowerReading;
  subscriptions: readonly Subscription[];
}

/**
 * Counts wakes from sleep by the gap in a steady tick: a timer does not run
 * while the machine sleeps, so a tick that comes far later than the last one
 * means a sleep happened in between.
 *
 * @param options - The clock, and the gap that counts as a sleep.
 * @returns `tick`, called on each timer tick, and the count so far.
 */
export function createWakeDetector({ now, gapMilliseconds }: {
  now: () => number;
  gapMilliseconds: number;
}) {
  let lastTick = now();
  let count = 0;
  return {
    tick() {
      const current = now();
      const isWake = current - lastTick > gapMilliseconds;
      lastTick = current;

      if (isWake) {
        count += 1;
      }
    },
    get count() {
      return count;
    }
  };
}

/**
 * The session power source over `Microsoft.Windows.System.Power.PowerManager`
 * of the Windows App SDK. Its three properties are read directly. Its events
 * are not subscribed to: any subscription (even one removed again) keeps the
 * Node process from exiting, and Windows raises them on a thread of its own,
 * which dynwinrt does not deliver. So a timer ticking once a second is the
 * change signal, and it also counts wakes from sleep by the gap between ticks,
 * because `SystemSuspendStatus` cannot be read before its event has fired.
 *
 * @returns Reads of the live state, and the timer that marks a change.
 */
export function windowsSystemPowerSource() {
  const wakes = createWakeDetector({
    now: Date.now,
    gapMilliseconds: WAKE_GAP_MILLISECONDS
  });
  return {
    read() {
      return {
        displayStatus: SessionPowerManager.displayStatus,
        effectivePowerMode: SessionPowerManager.effectivePowerMode2,
        userPresenceStatus: SessionPowerManager.userPresenceStatus,
        resumeCount: wakes.count
      };
    },
    subscriptions: [
      notify => {
        const timer = setInterval(() => {
          wakes.tick();
          notify();
        }, POLL_MILLISECONDS);
        timer.unref();
        return () => clearInterval(timer);
      }
    ]
  } satisfies SystemPowerSource;
}
