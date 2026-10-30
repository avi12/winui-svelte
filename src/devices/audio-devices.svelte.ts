import { AudioDeviceRole, DeviceClass, MediaDevice } from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import type { DeviceWatcherOptions } from "./device-watcher.svelte.ts";
import { deviceWatcher } from "./device-watcher.svelte.ts";
import type { Subscription } from "./live.svelte.ts";
import { liveTracker, subscriptionOfStaticEvent } from "./live.svelte.ts";

/** The ids of the default audio endpoints of one role. */
export interface DefaultAudioEndpoints {
  readonly outputId: string;
  readonly inputId: string;
}

/** The reads and events `audioDevices` uses for the defaults; a test stands in for them. */
export interface AudioDefaultsSource {
  read(role: AudioDeviceRole): DefaultAudioEndpoints;
  subscriptions: readonly Subscription[];
}

/**
 * The defaults source over `MediaDevice`.
 *
 * @returns Reads of the default endpoint ids, and the events that change them.
 */
export function windowsAudioDefaults() {
  return {
    read: role => ({
      outputId: MediaDevice.getDefaultAudioRenderId(role),
      inputId: MediaDevice.getDefaultAudioCaptureId(role)
    }),
    subscriptions: [
      subscriptionOfStaticEvent({
        add: handler => MediaDevice.add_DefaultAudioRenderDeviceChanged(handler),
        remove: token => MediaDevice.remove_DefaultAudioRenderDeviceChanged(token)
      }),
      subscriptionOfStaticEvent({
        add: handler => MediaDevice.add_DefaultAudioCaptureDeviceChanged(handler),
        remove: token => MediaDevice.remove_DefaultAudioCaptureDeviceChanged(token)
      })
    ]
  } satisfies AudioDefaultsSource;
}

/** What `audioDevices` takes. */
export interface AudioDevicesOptions extends Pick<DeviceWatcherOptions, "signal" | "createSource"> {
  /** Where the default ids come from; the default is `MediaDevice`. */
  readonly defaults?: AudioDefaultsSource;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * The audio endpoints: the speakers and microphones, live, and which of each
 * is the default (the one `MediaDevice` names, which changes when the user
 * picks another in Settings or one is plugged in). `outputs` and `inputs` are
 * device watchers, so they list in `{#each outputs.devices.items as device
 * (device.id)}`. Only reads: nothing here starts audio or asks for the
 * microphone.
 *
 * @param options - Where the defaults come from, and how changes are delivered.
 * @returns `outputs`, `inputs`, and the reactive ids of the default and the communications endpoints.
 */
export function audioDevices(options: AudioDevicesOptions = {}) {
  const defaults = options.defaults ?? windowsAudioDefaults();
  const shared = {
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.deliver === undefined ? {} : { deliver: options.deliver },
    ...options.createSource === undefined ? {} : { createSource: options.createSource }
  };
  const track = liveTracker({
    subscriptions: defaults.subscriptions,
    deliver: options.deliver
  });
  function read(role: AudioDeviceRole) {
    track();
    return defaults.read(role);
  }
  return {
    outputs: deviceWatcher({
      ...shared,
      deviceClass: DeviceClass.AudioRender
    }),
    inputs: deviceWatcher({
      ...shared,
      deviceClass: DeviceClass.AudioCapture
    }),
    get defaultOutputId() {
      return read(AudioDeviceRole.Default).outputId;
    },
    get defaultInputId() {
      return read(AudioDeviceRole.Default).inputId;
    },
    get communicationsOutputId() {
      return read(AudioDeviceRole.Communications).outputId;
    },
    get communicationsInputId() {
      return read(AudioDeviceRole.Communications).inputId;
    }
  };
}
