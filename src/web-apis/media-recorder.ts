import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import type { MediaStream } from "./media-devices.ts";
import { windowsMediaRecorderBackend } from "./media-recorder-source.ts";
import type { MediaCapture } from "#winui/windows/media/capture/MediaCapture";

/** The picture quality of a recording; WinUI-only (`VideoEncodingQuality`). */
export type RecordingQuality = "auto" | "hd1080p" | "hd720p" | "vga" | "qvga";

/** What Windows adds to the standard `MediaRecorderOptions`. */
export interface MediaRecorderExtras {
  /** The resolution class of the recording; `auto` (the camera's own) by default. */
  readonly videoQuality?: RecordingQuality;
}

/** The standard `MediaRecorderOptions`, with the extras. */
export interface MediaRecorderOptions extends MediaRecorderExtras {
  readonly mimeType?: string;
  readonly audioBitsPerSecond?: number;
  readonly videoBitsPerSecond?: number;
  readonly bitsPerSecond?: number;
}

/** What the backend is asked to record. */
export interface RecordingRequest {
  readonly capture: MediaCapture | undefined;
  readonly mimeType: string;
  readonly hasVideo: boolean;
  readonly videoQuality: RecordingQuality;
}

/** A recording in progress. */
export interface RecordingHandle {
  pause(): Promise<void>;
  resume(): Promise<void>;

  /** Ends the recording and gives its bytes. */
  stop(): Promise<Uint8Array>;
}

/** What `MediaRecorder` records with: Windows' `MediaCapture` in the app, a fake in the tests. */
export interface MediaRecorderBackend {
  isTypeSupported(mimeType: string): boolean;
  start(request: RecordingRequest): Promise<RecordingHandle>;
}

/** The recorder's state. */
export type RecordingState = "inactive" | "recording" | "paused";

const VIDEO_MIME_TYPE = "video/mp4";
const AUDIO_MIME_TYPE = "audio/mp4";

/** The event of a recording: `dataavailable`, with the recorded `Blob`. */
export class BlobEvent extends Event {
  readonly data: Blob;

  constructor(type: string, init: { data: Blob }) {
    super(type);
    this.data = init.data;
  }
}

/** The `error` event of a recording. */
export class MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;

  constructor(type: string, init: { error: DOMException }) {
    super(type);
    this.error = init.error;
  }
}

/**
 * The standard `MediaRecorder`: records a stream from `getUserMedia` into
 * MP4, M4A, MP3 or WAV. The recording is held in memory and arrives as one
 * `dataavailable` when it stops; `timeslice` and `requestData` are accepted
 * and do not cut it earlier.
 */
export class MediaRecorder extends HandlerEventTarget {
  readonly stream: MediaStream;
  readonly mimeType: string;
  readonly videoQuality: RecordingQuality;
  private currentState: RecordingState = "inactive";
  private recording: RecordingHandle | undefined;
  private readonly backend: MediaRecorderBackend;

  /** Made by `new MediaRecorder(stream, options)` once `installMediaRecorder` ran. */
  constructor({ backend, stream, options = {} }: {
    backend: MediaRecorderBackend;
    stream: MediaStream;
    options?: MediaRecorderOptions;
  }) {
    super();
    this.backend = backend;
    this.stream = stream;
    const hasVideo = stream.getVideoTracks().length > 0;
    this.mimeType = options.mimeType ?? (hasVideo ? VIDEO_MIME_TYPE : AUDIO_MIME_TYPE);
    this.videoQuality = options.videoQuality ?? "auto";
    const isSupported = backend.isTypeSupported(this.mimeType);
    if (!isSupported) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: `MIME type ${this.mimeType} is not supported`
      });
    }
  }

  get state() {
    return this.currentState;
  }

  get onpause() {
    return this.getHandler("pause");
  }

  set onpause(handler: EventListener | null) {
    this.setHandler({
      type: "pause",
      handler
    });
  }

  get onstart() {
    return this.getHandler("start");
  }

  set onstart(handler: EventListener | null) {
    this.setHandler({
      type: "start",
      handler
    });
  }

  get onresume() {
    return this.getHandler("resume");
  }

  set onresume(handler: EventListener | null) {
    this.setHandler({
      type: "resume",
      handler
    });
  }

  get onstop() {
    return this.getHandler("stop");
  }

  set onstop(handler: EventListener | null) {
    this.setHandler({
      type: "stop",
      handler
    });
  }

  get onerror() {
    return this.getHandler("error");
  }

  set onerror(handler: EventListener | null) {
    this.setHandler({
      type: "error",
      handler
    });
  }

  get ondataavailable() {
    return this.getHandler("dataavailable");
  }

  set ondataavailable(handler: EventListener | null) {
    this.setHandler({
      type: "dataavailable",
      handler
    });
  }

  /** Whether `MediaRecorder` can make a recording of this type; MP4, M4A, MP3 and WAV. */
  static isTypeSupported(mimeType: string) {
    return activeBackend?.isTypeSupported(mimeType) ?? false;
  }

  /**
   * Starts recording.
   *
   * @throws {DOMException} `InvalidStateError` when it already records.
   */
  start(_timeslice?: number) {
    const isIdle = this.currentState === "inactive";
    if (!isIdle) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "The MediaRecorder's state is not 'inactive'"
      });
    }

    this.currentState = "recording";
    const request = {
      capture: this.stream.mediaCapture,
      mimeType: this.mimeType,
      hasVideo: this.stream.getVideoTracks().length > 0,
      videoQuality: this.videoQuality
    } satisfies RecordingRequest;
    this.backend.start(request).then(handle => {
      this.recording = handle;
      this.dispatchEvent(new Event("start"));
    }, (error: unknown) => {
      this.currentState = "inactive";
      this.fail(error);
    });
  }

  /** Ends the recording: `dataavailable` with all of it, then `stop`. */
  stop() {
    const recording = this.recording;
    const isActive = this.currentState !== "inactive" && recording !== undefined;
    if (!isActive) {
      return;
    }

    this.currentState = "inactive";
    this.recording = undefined;
    recording.stop().then(bytes => {
      const type = this.mimeType;
      this.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob([new Uint8Array(bytes)], { type }) }));
      this.dispatchEvent(new Event("stop"));
    }, (error: unknown) => {
      this.fail(error);
      this.dispatchEvent(new Event("stop"));
    });
  }

  /** Pauses the recording. */
  pause() {
    const recording = this.recording;
    const isRecording = this.currentState === "recording" && recording !== undefined;
    if (!isRecording) {
      return;
    }

    this.currentState = "paused";
    recording.pause().then(() => {
      this.dispatchEvent(new Event("pause"));
    }, (error: unknown) => {
      this.fail(error);
    });
  }

  /** Goes on recording. */
  resume() {
    const recording = this.recording;
    const isPaused = this.currentState === "paused" && recording !== undefined;
    if (!isPaused) {
      return;
    }

    this.currentState = "recording";
    recording.resume().then(() => {
      this.dispatchEvent(new Event("resume"));
    }, (error: unknown) => {
      this.fail(error);
    });
  }

  /**
   * Accepted for compatibility; the recording arrives as one piece when it stops.
   *
   * @throws {DOMException} `InvalidStateError` when it does not record.
   */
  requestData() {
    const isIdle = this.currentState === "inactive";
    if (isIdle) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "The MediaRecorder's state is 'inactive'"
      });
    }
  }

  get [Symbol.toStringTag]() {
    return "MediaRecorder";
  }

  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.dispatchEvent(
      new MediaRecorderErrorEvent("error", {
        error: domException({
          name: DomErrorName.NOT_SUPPORTED,
          message
        })
      })
    );
  }
}

let activeBackend: MediaRecorderBackend | undefined;

/** What `installMediaRecorder` takes. */
export interface MediaRecorderInstallOptions {
  /** Stands in for Windows' `MediaCapture`; the tests give one. */
  readonly backend?: MediaRecorderBackend;
}

/**
 * Defines `MediaRecorder` and `BlobEvent` over the `MediaCapture` a stream from
 * `installMediaDevices`' `getUserMedia` carries. Nothing is defined until this
 * is called; call it on the thread the app's code runs on.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes them away again.
 */
export function installMediaRecorder(options: MediaRecorderInstallOptions = {}) {
  const backend = options.backend ?? windowsMediaRecorderBackend();
  const previous = activeBackend;
  activeBackend = backend;
  class BoundMediaRecorder extends MediaRecorder {
    constructor(stream: MediaStream, recorderOptions: MediaRecorderOptions = {}) {
      super({
        backend,
        stream,
        options: recorderOptions
      });
    }
  }

  const uninstalls = [
    defineProperty({
      name: "MediaRecorder",
      value: BoundMediaRecorder
    }),
    defineProperty({
      name: "BlobEvent",
      value: BlobEvent
    })
  ];
  return () => {
    activeBackend = previous;
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
