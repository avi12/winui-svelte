import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { MediaPermission } from "./media-access.ts";
import type { MediaTrackConstraints, MediaTrackConstraintSet, VideoMode } from "./media-constraints.ts";
import { blockingConstraint, nearestMode, supportedConstraints, wishesOf } from "./media-constraints.ts";
import { windowsMediaDevicesBackend } from "./media-devices-source.ts";
import type { PermissionStateName } from "./permissions.ts";
import { PermissionStateName as PermissionState, registerPermission } from "./permissions.ts";
import type { MediaCapture } from "#winui/windows/media/capture/MediaCapture";

const ID_PENALTY = 4;
const FACING_PENALTY = 2;

export type { MediaTrackConstraints, MediaTrackConstraintSet, VideoMode } from "./media-constraints.ts";

/** The three values of `MediaDeviceInfo.kind`. */
export type MediaDeviceKind = "audioinput" | "audiooutput" | "videoinput";

/** Which side of the device a camera is on. */
export type CameraPanel = "front" | "back" | "other";

/** What a device is, as the backend reports it. */
export interface CaptureDevice {
  readonly id: string;
  readonly name: string;
  readonly groupId: string;
  readonly kind: MediaDeviceKind;
  readonly isDefault: boolean;
  readonly panel: CameraPanel;
}

/** One axis of a camera that can be set: zoom, exposure, focus and the rest. */
export interface CameraAxis {
  /** Whether this camera has the axis at all. */
  readonly isSupported: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;

  /** The value now; `undefined` when the camera does not say. */
  readonly value: number | undefined;

  /** Whether the camera sets the axis itself. */
  readonly isAuto: boolean | undefined;

  /** Sets the axis; false when the camera refuses. */
  setValue(value: number): boolean;

  /** Hands the axis to the camera or takes it back; false when it cannot. */
  setAuto(isAuto: boolean): boolean;
}

/** The axes of `VideoDeviceController`, by their WinUI names. */
export const CAMERA_AXES = [
  "brightness",
  "contrast",
  "hue",
  "whiteBalance",
  "backlightCompensation",
  "pan",
  "tilt",
  "zoom",
  "roll",
  "exposure",
  "focus"
] as const;
/** The name of one camera axis. */
export type CameraAxisName = (typeof CAMERA_AXES)[number];

/** The settable axes of a camera. */
export type CameraControls = Readonly<Record<CameraAxisName, CameraAxis>>;

/** A capture the backend opened, with the camera and microphone as one object. */
export interface OpenedCapture {
  /** The `MediaCapture` underneath; absent in a fake. */
  readonly native: MediaCapture | undefined;
  readonly camera: CameraControls | undefined;
  setVideoMode(mode: VideoMode): Promise<void>;
  setAudioMuted(isMuted: boolean): void;
  onFailed(callback: () => void): () => void;
  close(): void;
}

/** What the backend is asked to open. */
export interface OpenRequest {
  readonly audioDeviceId: string | undefined;
  readonly videoDeviceId: string | undefined;
  readonly videoMode: VideoMode | undefined;
  readonly sharingMode: SharingMode;
  readonly profileId: string | undefined;
}

/** The screen or window the user picked. */
export interface DisplaySurface {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly surface: "monitor" | "window";

  /** The `GraphicsCaptureItem`; absent in a fake. */
  readonly native: unknown;
  readonly cursor: "always" | "never";
  close(): void;
}

/** What the backend is asked to show a picker for. */
export interface DisplayRequest {
  readonly cursor: "always" | "never";
}

/** What `navigator.mediaDevices` works with: Windows' capture classes in the app, a fake in the tests. */
export interface MediaDevicesBackend {
  access(permission: MediaPermission): PermissionStateName;
  devices(): Promise<readonly CaptureDevice[]>;
  onDevicesChanged(callback: () => void): () => void;
  videoModes(deviceId: string): Promise<readonly VideoMode[]>;
  open(request: OpenRequest): Promise<OpenedCapture>;
  pickDisplay(request: DisplayRequest): Promise<DisplaySurface | undefined>;
}

/** Whether other apps may use the camera while this one does; WinUI-only. */
export type SharingMode = "shared" | "exclusive";

/** What Windows adds to the standard `MediaStreamConstraints`; a browser ignores every member. */
export interface MediaStreamConstraintExtras {
  /** `exclusive` takes the device for this app alone; `shared` (the default) lets others read it. */
  readonly sharingMode?: SharingMode;
}

/** The standard `MediaStreamConstraints`, with the extras. */
export interface MediaStreamConstraints extends MediaStreamConstraintExtras {
  readonly audio?: boolean | MediaTrackConstraints;
  readonly video?: boolean | MediaTrackConstraints;
}

/** What Windows adds to `getDisplayMedia`'s options. */
export interface DisplayMediaExtras {
  /** Whether the mouse cursor is drawn in the capture; `always` by default. */
  readonly cursor?: "always" | "never";
}

/** The `getDisplayMedia` options, with the extras. */
export interface DisplayMediaStreamOptions extends DisplayMediaExtras {
  readonly video?: boolean | MediaTrackConstraints;
  readonly audio?: boolean;
}

/** `OverconstrainedError`: no device or format meets the constraints. */
export class OverconstrainedError extends DOMException {
  readonly constraint: string;

  constructor(constraint: string, message = "") {
    super(message, DomErrorName.OVERCONSTRAINED);
    this.constraint = constraint;
  }
}

function sizeSettingsOf(size: {
  readonly width: number;
  readonly height: number;
}) {
  return {
    width: size.width,
    height: size.height,
    aspectRatio: size.width / size.height
  };
}

function facingSettingsOf(panel: CameraPanel) {
  const isFront = panel === "front";
  const isBack = panel === "back";
  if (isFront) {
    return { facingMode: "user" as const };
  }

  return isBack ? { facingMode: "environment" as const } : {};
}

function notReadable(message: string) {
  return new DOMException(message, DomErrorName.NOT_READABLE);
}

/** The standard `MediaDeviceInfo`. */
export class MediaDeviceInfo {
  readonly deviceId: string;
  readonly kind: MediaDeviceKind;
  readonly label: string;
  readonly groupId: string;
  readonly isDefault: boolean;
  readonly panel: CameraPanel;

  /** Made by `enumerateDevices`. */
  constructor({ device, isRevealed }: {
    device: CaptureDevice;
    isRevealed: boolean;
  }) {
    this.deviceId = isRevealed ? device.id : "";
    this.kind = device.kind;
    this.label = isRevealed ? device.name : "";
    this.groupId = isRevealed ? device.groupId : "";
    this.isDefault = device.isDefault;
    this.panel = device.panel;
  }

  /** The device as plain data, as `JSON.stringify` wants it. */
  toJSON() {
    return {
      deviceId: this.deviceId,
      kind: this.kind,
      label: this.label,
      groupId: this.groupId
    };
  }

  get [Symbol.toStringTag]() {
    return "MediaDeviceInfo";
  }
}

/** What `getSettings()` of a track reports. */
export interface MediaTrackSettings {
  readonly deviceId: string;
  readonly groupId: string;
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: number;
  readonly aspectRatio?: number;
  readonly facingMode?: "user" | "environment";
  readonly displaySurface?: "monitor" | "window";
  readonly cursor?: "always" | "never";
}

/** What `getCapabilities()` of a track reports. */
export interface MediaTrackCapabilities {
  readonly deviceId: string;
  readonly groupId: string;
  readonly width?: {
    readonly min: number;
    readonly max: number;
  };
  readonly height?: {
    readonly min: number;
    readonly max: number;
  };
  readonly frameRate?: {
    readonly min: number;
    readonly max: number;
  };
  readonly facingMode?: readonly string[];
}

/** What every track of one `getUserMedia` call shares. */
interface CaptureSource {
  readonly capture: OpenedCapture | undefined;
  readonly surface: DisplaySurface | undefined;
  liveTracks: number;
}

/** What a `MediaStreamTrack` is made from. */
export interface TrackInit {
  readonly kind: "audio" | "video";
  readonly label: string;
  readonly source: CaptureSource;
  readonly device: CaptureDevice | undefined;
  readonly modes: readonly VideoMode[];
  readonly mode: VideoMode | undefined;
}

/** The standard `MediaStreamTrack`. */
export class MediaStreamTrack extends HandlerEventTarget {
  readonly kind: "audio" | "video";
  readonly id = crypto.randomUUID();
  readonly label: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly muted = false;
  contentHint = "";
  private isEnabledNow = true;
  private state: "live" | "ended" = "live";
  private currentConstraints: MediaTrackConstraints = {};
  private readonly source: CaptureSource;
  private readonly device: CaptureDevice | undefined;
  private readonly modes: readonly VideoMode[];
  private mode: VideoMode | undefined;

  /** Made by `getUserMedia`, `getDisplayMedia` and `clone`. */
  constructor(init: TrackInit) {
    super();
    this.kind = init.kind;
    this.label = init.label;
    this.source = init.source;
    this.device = init.device;
    this.modes = init.modes;
    this.mode = init.mode;
    this.source.liveTracks += 1;
  }

  get enabled() {
    return this.isEnabledNow;
  }

  set enabled(isEnabled: boolean) {
    this.isEnabledNow = Boolean(isEnabled);
    const isAudio = this.kind === "audio";
    if (isAudio) {
      this.source.capture?.setAudioMuted(!this.isEnabledNow);
    }
  }

  get readyState() {
    return this.state;
  }

  get onended() {
    return this.getHandler("ended");
  }

  set onended(handler: EventListener | null) {
    this.setHandler({
      type: "ended",
      handler
    });
  }

  get onmute() {
    return this.getHandler("mute");
  }

  set onmute(handler: EventListener | null) {
    this.setHandler({
      type: "mute",
      handler
    });
  }

  get onunmute() {
    return this.getHandler("unmute");
  }

  set onunmute(handler: EventListener | null) {
    this.setHandler({
      type: "unmute",
      handler
    });
  }

  /** The camera's settable axes (zoom, exposure, focus and more); WinUI-only, absent on audio and screens. */
  get camera() {
    return this.kind === "video" ? this.source.capture?.camera : undefined;
  }

  /** The screen or window a display track captures, as `GraphicsCaptureItem`; WinUI-only. */
  get captureItem() {
    return this.source.surface?.native;
  }

  /** What the track is now. */
  getSettings() {
    const { device, mode } = this;
    const { surface } = this.source;
    const base: MediaTrackSettings = {
      deviceId: device?.id ?? "",
      groupId: device?.groupId ?? ""
    };
    const isVideo = this.kind === "video";
    if (!isVideo) {
      return base;
    }

    const size = mode ?? surface;
    const settings: MediaTrackSettings = {
      ...base,
      ...(size === undefined ? {} : sizeSettingsOf(size)),
      ...(mode === undefined ? {} : { frameRate: mode.frameRate }),
      ...(device === undefined ? {} : facingSettingsOf(device.panel)),
      ...(surface === undefined ? {} : {
        displaySurface: surface.surface,
        cursor: surface.cursor
      })
    };
    return settings;
  }

  /** What the device can be set to. */
  getCapabilities() {
    const { device, modes } = this;
    const base: MediaTrackCapabilities = {
      deviceId: device?.id ?? "",
      groupId: device?.groupId ?? ""
    };
    const isVideo = this.kind === "video" && modes.length > 0;
    if (!isVideo) {
      return base;
    }

    function range(key: "width" | "height" | "frameRate") {
      const values = modes.map(mode => mode[key]);
      return {
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }
    const isFacingKnown = device?.panel !== "other";
    const capabilities: MediaTrackCapabilities = {
      ...base,
      width: range("width"),
      height: range("height"),
      frameRate: range("frameRate"),
      ...(isFacingKnown ? { facingMode: [device?.panel === "back" ? "environment" : "user"] } : {})
    };
    return capabilities;
  }

  /** The constraints last applied. */
  getConstraints() {
    return this.currentConstraints;
  }

  /**
   * Changes the camera's format to the one nearest the constraints.
   *
   * @throws {OverconstrainedError} When no format meets them.
   */
  async applyConstraints(constraints: MediaTrackConstraints = {}) {
    const isVideo = this.kind === "video" && this.source.capture !== undefined;
    if (isVideo) {
      const mode = nearestMode({
        modes: this.modes,
        constraints
      });
      const isMissingMode = mode === undefined;
      if (isMissingMode) {
        throw new OverconstrainedError(blockingConstraint({
          modes: this.modes,
          constraints
        }), "The constraints cannot be met");
      }

      await this.source.capture?.setVideoMode(mode);
      this.mode = mode;
    }

    this.currentConstraints = constraints;
  }

  /** Ends the track; the device is released when none of its tracks is live. */
  stop() {
    const isLive = this.state === "live";
    if (!isLive) {
      return;
    }

    this.state = "ended";
    this.source.liveTracks -= 1;
    const isLast = this.source.liveTracks === 0;
    if (isLast) {
      this.source.capture?.close();
      this.source.surface?.close();
    }
  }

  /** Another track of the same device. */
  clone() {
    const copy = new MediaStreamTrack({
      kind: this.kind,
      label: this.label,
      source: this.source,
      device: this.device,
      modes: this.modes,
      mode: this.mode
    });
    copy.enabled = this.isEnabledNow;
    return copy;
  }

  /** Called by the stream's capture when the device goes away. */
  end() {
    const isLive = this.state === "live";
    if (isLive) {
      this.state = "ended";
      this.source.liveTracks -= 1;
      this.dispatchEvent(new Event("ended"));
    }
  }

  get [Symbol.toStringTag]() {
    return "MediaStreamTrack";
  }
}

/** The standard `MediaStream`: a set of tracks. */
export class MediaStream extends HandlerEventTarget {
  readonly id = crypto.randomUUID();
  private readonly tracks: MediaStreamTrack[] = [];
  private nativeCapture: MediaCapture | undefined;

  constructor(source?: MediaStream | readonly MediaStreamTrack[]) {
    super();
    const initial = source instanceof MediaStream ? source.getTracks().map(track => track.clone()) : source ?? [];
    for (const track of initial) {
      this.tracks.push(track);
    }

    const isCopy = source instanceof MediaStream;
    if (isCopy) {
      this.nativeCapture = source.mediaCapture;
    }
  }

  /** Whether any track is live. */
  get active() {
    return this.tracks.some(track => track.readyState === "live");
  }

  /** The `MediaCapture` that feeds the stream, for everything WinRT does with it; WinUI-only. */
  get mediaCapture() {
    return this.nativeCapture;
  }

  set mediaCapture(value: MediaCapture | undefined) {
    this.nativeCapture = value;
  }

  get onaddtrack() {
    return this.getHandler("addtrack");
  }

  set onaddtrack(handler: EventListener | null) {
    this.setHandler({
      type: "addtrack",
      handler
    });
  }

  get onremovetrack() {
    return this.getHandler("removetrack");
  }

  set onremovetrack(handler: EventListener | null) {
    this.setHandler({
      type: "removetrack",
      handler
    });
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter(track => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter(track => track.kind === "video");
  }

  getTrackById(id: string) {
    return this.tracks.find(track => track.id === id) ?? null;
  }

  addTrack(track: MediaStreamTrack) {
    const isKnown = this.tracks.includes(track);
    if (isKnown) {
      return;
    }

    this.tracks.push(track);
    this.dispatchEvent(new Event("addtrack"));
  }

  removeTrack(track: MediaStreamTrack) {
    const index = this.tracks.indexOf(track);
    const isKnown = index >= 0;
    if (isKnown) {
      this.tracks.splice(index, 1);
      this.dispatchEvent(new Event("removetrack"));
    }
  }

  clone() {
    return new MediaStream(this);
  }

  get [Symbol.toStringTag]() {
    return "MediaStream";
  }
}

function inputKindOf(permission: MediaPermission) {
  return permission === MediaPermission.CAMERA ? "videoinput" : "audioinput";
}

function panelMatches({ panel, facing }: {
  panel: CameraPanel;
  facing: string;
}) {
  const isUser = facing === "user";
  const isEnvironment = facing === "environment";
  return (isUser && panel === "front") || (isEnvironment && panel === "back");
}

function rankedDevices({ devices, constraints }: {
  devices: readonly CaptureDevice[];
  constraints: MediaTrackConstraintSet;
}) {
  const ids = wishesOf(constraints.deviceId);
  const facing = wishesOf(constraints.facingMode);
  const required = devices.filter(device => ids.exact.length === 0 || ids.exact.includes(device.id));
  const hasRequired = required.length > 0;
  if (!hasRequired) {
    throw new OverconstrainedError("deviceId", "No device has the requested id");
  }

  function isFacingWanted(device: CaptureDevice) {
    return facing.exact.some(wish => panelMatches({
      panel: device.panel,
      facing: wish
    }));
  }

  const faced = required.filter(device => facing.exact.length === 0 || isFacingWanted(device));
  const hasFaced = faced.length > 0;
  if (!hasFaced) {
    throw new OverconstrainedError("facingMode", "No camera faces the requested way");
  }

  function rank(device: CaptureDevice) {
    const isIdealId = ids.ideal.includes(device.id);
    const isIdealFacing = facing.ideal.some(wish => panelMatches({
      panel: device.panel,
      facing: wish
    }));
    return (isIdealId ? 0 : ID_PENALTY) + (isIdealFacing ? 0 : FACING_PENALTY) + (device.isDefault ? 0 : 1);
  }

  return [...faced].sort((first, second) => rank(first) - rank(second));
}

/** The `navigator.mediaDevices` object. */
export class MediaDevices extends HandlerEventTarget {
  private readonly backend: MediaDevicesBackend;
  private stopWatching: (() => void) | undefined;
  private isCaptureOpened = false;

  /** Made by `installMediaDevices`. */
  constructor(backend: MediaDevicesBackend) {
    super();
    this.backend = backend;
  }

  get ondevicechange() {
    return this.getHandler("devicechange");
  }

  set ondevicechange(handler: EventListener | null) {
    this.setHandler({
      type: "devicechange",
      handler
    });
    this.watchChanges();
  }

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ) {
    super.addEventListener(type, callback, options);
    const isChange = type === "devicechange";
    if (isChange) {
      this.watchChanges();
    }
  }

  /** The inputs and outputs Windows has; labels and ids stay empty until the camera or microphone may be used. */
  async enumerateDevices() {
    const devices = await this.backend.devices();
    const infos: MediaDeviceInfo[] = [];
    for (const kind of ["audioinput", "audiooutput", "videoinput"] as const) {
      const ofKind = devices.filter(device => device.kind === kind);
      const isRevealed = this.isRevealed(kind);
      const listed = isRevealed ? ofKind : ofKind.slice(0, 1);
      for (const device of listed) {
        infos.push(
          new MediaDeviceInfo({
            device,
            isRevealed
          })
        );
      }
    }

    return infos;
  }

  /** What `getUserMedia` honors: width, height, frame rate, facing mode and the ids. */
  getSupportedConstraints() {
    return supportedConstraints();
  }

  /**
   * Opens the camera and microphone the constraints describe.
   *
   * @throws {TypeError} When neither audio nor video is asked for.
   * @throws {DOMException} `NotAllowedError` when Windows' privacy switch is off, `NotFoundError` when there is
   *   no such device, `NotReadableError` when another app holds it.
   * @throws {OverconstrainedError} When no device or format meets the constraints.
   */
  async getUserMedia(constraints: MediaStreamConstraints = {}) {
    const isAudioWanted = Boolean(constraints.audio);
    const isVideoWanted = Boolean(constraints.video);
    const isNothingWanted = !isAudioWanted && !isVideoWanted;
    if (isNothingWanted) {
      throw new TypeError("Failed to execute 'getUserMedia' on 'MediaDevices': At least one of audio and video must be requested");
    }

    this.requireAccess({
      isAudioWanted,
      isVideoWanted
    });
    const devices = await this.backend.devices();
    const audio = isAudioWanted ? this.pickAudio({
      devices,
      constraints: trackConstraintsOf(constraints.audio)
    }) : undefined;
    const video = isVideoWanted ? await this.pickVideo({
      devices,
      constraints: trackConstraintsOf(constraints.video)
    }) : undefined;
    const capture = await this.open({
      audioDeviceId: audio?.id,
      videoDeviceId: video?.device.id,
      videoMode: video?.mode,
      sharingMode: constraints.sharingMode ?? "shared",
      profileId: trackConstraintsOf(constraints.video).profileId
    });
    this.isCaptureOpened = true;
    const stream = new MediaStream();
    stream.mediaCapture = capture.native;
    const source: CaptureSource = {
      capture,
      surface: undefined,
      liveTracks: 0
    };
    const tracks: MediaStreamTrack[] = [];
    const hasAudio = audio !== undefined;
    if (hasAudio) {
      tracks.push(
        this.trackOf({
          kind: "audio",
          device: audio,
          source,
          modes: [],
          mode: undefined
        })
      );
    }

    const hasVideo = video !== undefined;
    if (hasVideo) {
      tracks.push(
        this.trackOf({
          kind: "video",
          device: video.device,
          source,
          modes: video.modes,
          mode: video.mode
        })
      );
    }

    for (const track of tracks) {
      stream.addTrack(track);
    }

    capture.onFailed(() => {
      for (const track of tracks) {
        track.end();
      }
    });
    return stream;
  }

  /**
   * Asks the user which screen or window to share. Frames are not delivered
   * yet: the stream carries the chosen surface (`track.captureItem`) and its
   * size.
   *
   * @throws {DOMException} `NotAllowedError` when the user cancels the picker.
   */
  async getDisplayMedia(options: DisplayMediaStreamOptions = {}) {
    const surface = await this.backend.pickDisplay({ cursor: options.cursor ?? "always" });
    const isCanceled = surface === undefined;
    if (isCanceled) {
      throw domException({
        name: DomErrorName.NOT_ALLOWED,
        message: "Permission denied"
      });
    }

    const stream = new MediaStream();
    stream.addTrack(
      new MediaStreamTrack({
        kind: "video",
        label: surface.name,
        device: undefined,
        modes: [],
        mode: undefined,
        source: {
          capture: undefined,
          surface,
          liveTracks: 0
        }
      })
    );
    return stream;
  }

  get [Symbol.toStringTag]() {
    return "MediaDevices";
  }

  private isRevealed(kind: MediaDeviceKind) {
    const permission = kind === "videoinput" ? MediaPermission.CAMERA : MediaPermission.MICROPHONE;
    return this.isCaptureOpened || this.backend.access(permission) === PermissionState.GRANTED;
  }

  private watchChanges() {
    const isWatching = this.stopWatching !== undefined;
    if (isWatching) {
      return;
    }

    this.stopWatching = this.backend.onDevicesChanged(() => {
      this.dispatchEvent(new Event("devicechange"));
    });
  }

  private requireAccess({ isAudioWanted, isVideoWanted }: {
    isAudioWanted: boolean;
    isVideoWanted: boolean;
  }) {
    const cameraState = this.backend.access(MediaPermission.CAMERA);
    const microphoneState = this.backend.access(MediaPermission.MICROPHONE);
    const isCameraDenied = isVideoWanted && cameraState === PermissionState.DENIED;
    const isMicrophoneDenied = isAudioWanted && microphoneState === PermissionState.DENIED;
    const isDenied = isCameraDenied || isMicrophoneDenied;
    if (isDenied) {
      throw domException({
        name: DomErrorName.NOT_ALLOWED,
        message: "Permission denied"
      });
    }
  }

  private pickAudio({ devices, constraints }: {
    devices: readonly CaptureDevice[];
    constraints: MediaTrackConstraints;
  }) {
    const inputs = devices.filter(device => device.kind === inputKindOf(MediaPermission.MICROPHONE));
    const [first] = rankedDevicesOrNone({
      devices: inputs,
      constraints
    });
    const isMissingFirst = first === undefined;
    if (isMissingFirst) {
      throw domException({
        name: DomErrorName.NOT_FOUND,
        message: "Requested device not found"
      });
    }

    return first;
  }

  private async pickVideo({ devices, constraints }: {
    devices: readonly CaptureDevice[];
    constraints: MediaTrackConstraints;
  }) {
    const cameras = devices.filter(device => device.kind === inputKindOf(MediaPermission.CAMERA));
    const candidates = rankedDevicesOrNone({
      devices: cameras,
      constraints
    });
    const hasCamera = candidates.length > 0;
    if (!hasCamera) {
      throw domException({
        name: DomErrorName.NOT_FOUND,
        message: "Requested device not found"
      });
    }

    let blocking = "width";
    for (const device of candidates) {
      const modes = await this.backend.videoModes(device.id);
      const mode = nearestMode({
        modes,
        constraints
      });
      const hasMode = mode !== undefined;
      if (hasMode) {
        return {
          device,
          mode,
          modes
        };
      }

      blocking = blockingConstraint({
        modes,
        constraints
      });
    }

    throw new OverconstrainedError(blocking, "The constraints cannot be met by any camera");
  }

  private async open(request: OpenRequest) {
    try {
      return await this.backend.open(request);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isDenied = /80070005|access is denied|denied/iu.test(message);
      if (isDenied) {
        throw domException({
          name: DomErrorName.NOT_ALLOWED,
          message: "Permission denied"
        });
      }

      throw notReadable(`Could not start the device: ${message}`);
    }
  }

  private trackOf({ kind, device, source, modes, mode }: {
    kind: "audio" | "video";
    device: CaptureDevice;
    source: CaptureSource;
    modes: readonly VideoMode[];
    mode: VideoMode | undefined;
  }) {
    return new MediaStreamTrack({
      kind,
      label: device.name,
      source,
      device,
      modes,
      mode
    });
  }
}

function trackConstraintsOf(value: boolean | MediaTrackConstraints | undefined) {
  const isObject = typeof value === "object";
  return isObject ? value : {};
}

function rankedDevicesOrNone({ devices, constraints }: {
  devices: readonly CaptureDevice[];
  constraints: MediaTrackConstraints;
}) {
  const isEmpty = devices.length === 0;
  return isEmpty ? [] : rankedDevices({
    devices,
    constraints
  });
}

/** What `installMediaDevices` takes. */
export interface MediaDevicesInstallOptions {
  /** Stands in for the Windows capture classes; the tests give one. */
  readonly backend?: MediaDevicesBackend;
}

/**
 * Defines `navigator.mediaDevices`, `MediaStream`, `MediaStreamTrack`,
 * `MediaDeviceInfo` and `OverconstrainedError`, and answers the Permissions
 * API's `camera` and `microphone`. Nothing is defined until this is called;
 * call it on the thread the app's code runs on.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes them away again.
 */
export function installMediaDevices(options: MediaDevicesInstallOptions = {}) {
  const backend = options.backend ?? windowsMediaDevicesBackend();
  const uninstalls = [
    defineNavigatorProperty({
      name: "mediaDevices",
      value: new MediaDevices(backend)
    }),
    defineProperty({
      name: "MediaDevices",
      value: MediaDevices
    }),
    defineProperty({
      name: "MediaStream",
      value: MediaStream
    }),
    defineProperty({
      name: "MediaStreamTrack",
      value: MediaStreamTrack
    }),
    defineProperty({
      name: "MediaDeviceInfo",
      value: MediaDeviceInfo
    }),
    defineProperty({
      name: "OverconstrainedError",
      value: OverconstrainedError
    }),
    registerPermission({
      name: MediaPermission.CAMERA,
      provider: {
        state: () => backend.access(MediaPermission.CAMERA)
      }
    }),
    registerPermission({
      name: MediaPermission.MICROPHONE,
      provider: {
        state: () => backend.access(MediaPermission.MICROPHONE)
      }
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}

export type {
  MediaRecorderBackend,
  MediaRecorderExtras,
  MediaRecorderInstallOptions,
  MediaRecorderOptions,
  RecordingHandle,
  RecordingQuality,
  RecordingRequest,
  RecordingState
} from "./media-recorder.ts";
export { BlobEvent, installMediaRecorder, MediaRecorder, MediaRecorderErrorEvent } from "./media-recorder.ts";
