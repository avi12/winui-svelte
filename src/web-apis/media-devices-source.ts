import { windowsMediaAccess } from "./media-access.ts";
import type { VideoMode } from "./media-constraints.ts";
import type {
  CameraAxis,
  CameraControls,
  CaptureDevice,
  DisplayRequest,
  DisplaySurface,
  MediaDeviceKind,
  MediaDevicesBackend,
  OpenedCapture,
  OpenRequest
} from "./media-devices.ts";
import { openFrameSource } from "#src/capture/frame-source.js";
import { monitorItemOf } from "#src/capture/monitors.js";
import { DeviceClass, DeviceInformation } from "#src/devices/bindings.js";
import { deviceChanges } from "#src/devices/device-changes.js";
import { resolvedQuery } from "#src/devices/device-query.js";
import { GraphicsCapturePicker } from "#winui/windows/graphics/capture/GraphicsCapturePicker";
import { MediaCapture } from "#winui/windows/media/capture/MediaCapture";
import { MediaCaptureInitializationSettings } from "#winui/windows/media/capture/MediaCaptureInitializationSettings";
import { MediaCaptureSharingMode } from "#winui/windows/media/capture/MediaCaptureSharingMode";
import { MediaStreamType } from "#winui/windows/media/capture/MediaStreamType";
import { StreamingCaptureMode } from "#winui/windows/media/capture/StreamingCaptureMode";
import type { MediaDeviceControl } from "#winui/windows/media/devices/MediaDeviceControl";

const CONTAINER_ID = "System.Devices.ContainerId";
const PANEL_FRONT = 1;
const PANEL_BACK = 2;
const FALLBACK_MODE = {
  width: 640,
  height: 480,
  frameRate: 30
} satisfies VideoMode;
const MONITOR_NAME_PATTERN = /display|monitor/iu;

const deviceClasses = {
  audioinput: DeviceClass.AudioCapture,
  audiooutput: DeviceClass.AudioRender,
  videoinput: DeviceClass.VideoCapture
} satisfies Record<MediaDeviceKind, DeviceClass>;

const KINDS = ["audioinput", "audiooutput", "videoinput"] as const;

function panelOf(panel: number | undefined) {
  const isFront = panel === PANEL_FRONT;
  if (isFront) {
    return "front" as const;
  }

  const isBack = panel === PANEL_BACK;
  return isBack ? "back" as const : "other" as const;
}

async function devicesOfKind(kind: MediaDeviceKind) {
  const query = resolvedQuery({
    deviceClass: deviceClasses[kind],
    requestedProperties: [CONTAINER_ID]
  });
  const found = await DeviceInformation.findAllAsync(query.selector, [...query.requestedProperties], query.kind);
  return [...found].map(information => ({
    id: information.id,
    name: information.name,
    groupId: String(information.properties?.get(CONTAINER_ID) ?? information.id),
    kind,
    isDefault: information.isDefault,
    panel: panelOf(information.enclosureLocation?.panel)
  } satisfies CaptureDevice));
}

function axisOf(control: MediaDeviceControl) {
  const { supported: isSupported, min, max, step } = control.capabilities;
  const axis = {
    isSupported,
    min,
    max,
    step,
    get value() {
      const [value, isRead] = control.tryGetValue();
      return isRead ? value : undefined;
    },
    get isAuto() {
      const [isAuto, isRead] = control.tryGetAuto();
      return isRead ? isAuto : undefined;
    },
    setValue: (value: number) => control.trySetValue(value),
    setAuto: (isAuto: boolean) => control.trySetAuto(isAuto)
  } satisfies CameraAxis;
  return axis;
}

function camerasOf(capture: MediaCapture) {
  const controller = capture.videoDeviceController;
  return {
    brightness: axisOf(controller.brightness),
    contrast: axisOf(controller.contrast),
    hue: axisOf(controller.hue),
    whiteBalance: axisOf(controller.whiteBalance),
    backlightCompensation: axisOf(controller.backlightCompensation),
    pan: axisOf(controller.pan),
    tilt: axisOf(controller.tilt),
    zoom: axisOf(controller.zoom),
    roll: axisOf(controller.roll),
    exposure: axisOf(controller.exposure),
    focus: axisOf(controller.focus)
  } satisfies CameraControls;
}

async function modesOf(deviceId: string) {
  const profiles = [...(MediaCapture.findAllVideoProfiles(deviceId) ?? [])];
  const modes: VideoMode[] = [];
  for (const profile of profiles) {
    for (const description of profile.supportedPreviewMediaDescription ?? []) {
      const { width, height, frameRate } = description;
      const isKnown = modes.some(mode => {
        const isSameSize = mode.width === width && mode.height === height;
        return isSameSize && mode.frameRate === frameRate;
      });
      if (!isKnown) {
        modes.push({
          width,
          height,
          frameRate
        });
      }
    }
  }

  return modes.length > 0 ? modes : [FALLBACK_MODE];
}

function captureModeOf(request: OpenRequest) {
  const hasAudio = request.audioDeviceId !== undefined;
  const hasVideo = request.videoDeviceId !== undefined;
  const hasBoth = hasAudio && hasVideo;
  if (hasBoth) {
    return StreamingCaptureMode.AudioAndVideo;
  }

  return hasAudio ? StreamingCaptureMode.Audio : StreamingCaptureMode.Video;
}

function settingsOf(request: OpenRequest) {
  const settings = new MediaCaptureInitializationSettings();
  settings.streamingCaptureMode = captureModeOf(request);

  const hasAudioDeviceId = request.audioDeviceId !== undefined;
  if (hasAudioDeviceId) {
    settings.audioDeviceId = request.audioDeviceId;
  }

  const hasVideoDeviceId = request.videoDeviceId !== undefined;
  if (hasVideoDeviceId) {
    settings.videoDeviceId = request.videoDeviceId;
  }

  const isExclusive = request.sharingMode === "exclusive";
  const sharingModes = MediaCaptureSharingMode;
  settings.sharingMode = isExclusive ? sharingModes.ExclusiveControl : sharingModes.SharedReadOnly;
  return settings;
}

function profileOf(request: OpenRequest) {
  const { videoDeviceId, profileId } = request;
  const hasProfile = videoDeviceId !== undefined && profileId !== undefined;
  if (!hasProfile) {
    return undefined;
  }

  return [...(MediaCapture.findAllVideoProfiles(videoDeviceId) ?? [])].find(profile => profile.id === profileId);
}

interface SizedProperties {
  readonly width: number;
  readonly height: number;
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
}

function isSized(value: unknown): value is SizedProperties {
  return typeof value === "object" && value !== null && "width" in value && "height" in value && "frameRate" in value;
}

async function applyMode({ capture, mode }: {
  capture: MediaCapture;
  mode: VideoMode;
}) {
  const controller = capture.videoDeviceController;
  const available = [...(controller.getAvailableMediaStreamProperties(MediaStreamType.VideoPreview) ?? [])];
  const match = available.find(properties => isSized(properties)
    && properties.width === mode.width
    && properties.height === mode.height
    && Math.abs(properties.frameRate.numerator / properties.frameRate.denominator - mode.frameRate) < 1);
  const hasMatch = match !== undefined;
  if (hasMatch) {
    await controller.setMediaStreamPropertiesAsync(MediaStreamType.VideoPreview, match);
  }
}

async function open(request: OpenRequest) {
  const capture = new MediaCapture();
  const settings = settingsOf(request);
  const profile = profileOf(request);
  const hasProfile = profile !== undefined;
  if (hasProfile) {
    settings.videoProfile = profile;
  }

  await capture.initializeAsync(settings);
  const { videoMode } = request;
  const hasVideoMode = videoMode !== undefined;
  if (hasVideoMode) {
    await applyMode({
      capture,
      mode: videoMode
    });
  }

  const hasVideo = request.videoDeviceId !== undefined;
  const opened = {
    native: capture,
    camera: hasVideo ? camerasOf(capture) : undefined,
    setVideoMode: (mode: VideoMode) => applyMode({
      capture,
      mode
    }),
    setAudioMuted(isMuted: boolean) {
      capture.audioDeviceController.muted = isMuted;
    },
    onFailed: (callback: () => void) => capture.onFailed(() => {
      callback();
    }),
    close() {
      capture.close();
    }
  } satisfies OpenedCapture;
  return opened;
}

async function itemOf(request: DisplayRequest) {
  const { monitor } = request;
  const isKnown = monitor !== undefined;
  if (isKnown) {
    return monitorItemOf(monitor);
  }

  return new GraphicsCapturePicker().pickSingleItemAsync();
}

async function pickDisplay(request: DisplayRequest) {
  const item = await itemOf(request);
  const isCanceled = item == null;
  if (isCanceled) {
    return undefined;
  }

  const isMonitor = request.monitor !== undefined || MONITOR_NAME_PATTERN.test(item.displayName);
  const frames = openFrameSource({
    item,
    targetFramesPerSecond: request.targetFramesPerSecond,
    isCursorCaptured: request.cursor === "always"
  });
  const surface = {
    name: item.displayName,
    width: item.size.width,
    height: item.size.height,
    surface: isMonitor ? "monitor" as const : "window" as const,
    native: item,
    cursor: request.cursor,
    frames,
    close() {
      frames.close();
    }
  } satisfies DisplaySurface;
  return surface;
}

/**
 * The backend over Windows' capture classes. Devices come from
 * `DeviceInformation`, formats from the camera's capture profiles (no camera
 * is started to list them), a stream from one `MediaCapture` for the camera
 * and the microphone together, and the privacy switches from
 * `DeviceAccessInformation`. A camera without capture profiles reports one
 * format, 640 by 480 at 30 frames a second. `MediaCapture` raises its
 * events on a thread of its own; where the bindings do not deliver one, a
 * track does not hear that its device went away.
 *
 * @returns The backend.
 */
export function windowsMediaDevicesBackend() {
  const backend = {
    access: windowsMediaAccess,
    async devices() {
      const lists = await Promise.all(KINDS.map(kind => devicesOfKind(kind)));
      return lists.flat();
    },
    onDevicesChanged(callback) {
      const unsubscribes = KINDS.map(kind => deviceChanges({ deviceClass: deviceClasses[kind] })(callback));
      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
      };
    },
    videoModes: modesOf,
    open,
    pickDisplay
  } satisfies MediaDevicesBackend;
  return backend;
}
