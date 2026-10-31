import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { windowsMediaSessionBackend } from "./media-session-source.ts";
import type { MediaPlayer } from "#winui/windows/media/playback/MediaPlayer";

/** The `MediaSessionAction` values the Windows media overlay can raise. */
export const MediaSessionAction = {
  PLAY: "play",
  PAUSE: "pause",
  STOP: "stop",
  PREVIOUS_TRACK: "previoustrack",
  NEXT_TRACK: "nexttrack",
  SEEK_BACKWARD: "seekbackward",
  SEEK_FORWARD: "seekforward",
  SEEK_TO: "seekto"
} as const;
/** One of the values of `MediaSessionAction`. */
export type MediaSessionAction = (typeof MediaSessionAction)[keyof typeof MediaSessionAction];

const STANDARD_ONLY_ACTIONS = ["skipad", "togglecamera", "togglemicrophone", "hangup", "previousslide", "nextslide", "enterpictureinpicture"];
const PLAYBACK_STATES = ["none", "paused", "playing"] as const;

/** What the standard `MediaSession.playbackState` can be. */
export type MediaSessionPlaybackState = (typeof PLAYBACK_STATES)[number];

/** What kind of media the overlay shows the session as; WinUI-only. */
export type MediaSessionMediaType = "music" | "video" | "image";

/** What a Windows repeat button can ask for; WinUI-only. */
export type MediaSessionAutoRepeatMode = "none" | "track" | "list";

/** A picture of the standard `MediaMetadata.artwork` list. */
export interface MediaImage {
  readonly src: string;
  readonly sizes?: string;
  readonly type?: string;
}

/** What Windows adds to the standard `MediaMetadataInit`; a browser ignores every member. */
export interface MediaMetadataExtras {
  /** Music, video or image: how the overlay lays out the metadata; `music` by default. */
  readonly mediaType?: MediaSessionMediaType;

  /** The album's artist, music only. */
  readonly albumArtist?: string;

  /** The number of the track in the album, music only. */
  readonly trackNumber?: number;

  /** How many tracks the album has, music only. */
  readonly albumTrackCount?: number;

  /** The genres, music and video. */
  readonly genres?: readonly string[];

  /** The second line of a video, video only. */
  readonly subtitle?: string;
}

/** The standard `MediaMetadataInit`, with the extras. */
export interface MediaMetadataInit extends MediaMetadataExtras {
  readonly title?: string;
  readonly artist?: string;
  readonly album?: string;
  readonly artwork?: readonly MediaImage[];
}

/** What `setActionHandler` handlers receive. */
export interface MediaSessionActionDetails {
  readonly action: MediaSessionAction;
  readonly seekTime?: number;
  readonly seekOffset?: number;
  readonly fastSeek?: boolean;
}

/** A `setActionHandler` callback. */
export type MediaSessionActionHandler = (details: MediaSessionActionDetails) => void;

/** The position `setPositionState` was given, in seconds. */
export interface MediaPositionState {
  readonly duration?: number;
  readonly playbackRate?: number;
  readonly position?: number;
}

/** What Windows adds to `navigator.mediaSession`; set it, then call `update()`. */
export interface MediaSessionExtras {
  /** Whether the overlay shows shuffle as on; the overlay's shuffle button changes it and raises `shufflechange`. */
  isShuffleEnabled?: boolean;

  /** The repeat mode the overlay shows; its repeat button changes it and raises `repeatchange`. */
  autoRepeatMode?: MediaSessionAutoRepeatMode;

  /** Shows the state again; the setters do it, so call it only after setting `isShuffleEnabled` or `autoRepeatMode`. */
  update(): void;
}

declare global {
  // The extras join the standard types wherever this module is imported.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging is the point
  interface MediaMetadataInit extends MediaMetadataExtras {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging is the point
  interface MediaSession extends MediaSessionExtras {}
}

/** Everything the overlay shows, handed to the backend whenever any of it changes. */
export interface MediaSessionSnapshot {
  readonly metadata: {
    readonly title: string;
    readonly artist: string;
    readonly album: string;
    readonly artwork: readonly MediaImage[];
    readonly extras: MediaMetadataExtras;
  } | null;
  readonly playbackState: MediaSessionPlaybackState;
  readonly position: Required<MediaPositionState> | null;
  readonly actions: ReadonlySet<MediaSessionAction>;
  readonly isShuffleEnabled: boolean;
  readonly autoRepeatMode: MediaSessionAutoRepeatMode;
  readonly isCameraActive: boolean;
  readonly isMicrophoneActive: boolean;
}

/** What the overlay asked for. */
export type MediaSessionRequest =
  | {
    readonly kind: "action";
    readonly details: MediaSessionActionDetails;
  }
  | {
    readonly kind: "shuffle";
    readonly isEnabled: boolean;
  }
  | {
    readonly kind: "repeat";
    readonly mode: MediaSessionAutoRepeatMode;
  };

/** What `navigator.mediaSession` drives: the Windows media overlay in the app, a fake in the tests. */
export interface MediaSessionBackend {
  show(snapshot: MediaSessionSnapshot): void;
  onRequest(callback: (request: MediaSessionRequest) => void): () => void;
  close(): void;
}

function isSupportedAction(action: string): action is MediaSessionAction {
  return Object.values<string>(MediaSessionAction).includes(action);
}

function isPlaybackState(value: string): value is MediaSessionPlaybackState {
  return PLAYBACK_STATES.some(state => state === value);
}

/** The standard `MediaMetadata`: what the overlay shows about what plays. */
export class MediaMetadata {
  readonly extras: MediaMetadataExtras;
  private fields: {
    title: string;
    artist: string;
    album: string;
    artwork: readonly MediaImage[];
  };
  private onChange: (() => void) | undefined;

  constructor(init: MediaMetadataInit = {}) {
    const { title, artist, album, artwork, ...extras } = init;
    this.fields = {
      title: title ?? "",
      artist: artist ?? "",
      album: album ?? "",
      artwork: artwork?.map(image => ({ ...image })) ?? []
    };
    this.extras = extras;
  }

  get title() {
    return this.fields.title;
  }

  set title(value: string) {
    this.fields.title = String(value);
    this.onChange?.();
  }

  get artist() {
    return this.fields.artist;
  }

  set artist(value: string) {
    this.fields.artist = String(value);
    this.onChange?.();
  }

  get album() {
    return this.fields.album;
  }

  set album(value: string) {
    this.fields.album = String(value);
    this.onChange?.();
  }

  get artwork() {
    return this.fields.artwork;
  }

  set artwork(value: readonly MediaImage[]) {
    this.fields.artwork = value.map(image => ({ ...image }));
    this.onChange?.();
  }

  /** Told by the session this metadata is set on; `undefined` detaches it. */
  attach(onChange: (() => void) | undefined) {
    this.onChange = onChange;
  }

  get [Symbol.toStringTag]() {
    return "MediaMetadata";
  }
}

/** The `navigator.mediaSession` object. */
export class MediaSession extends HandlerEventTarget {
  isShuffleEnabled = false;
  autoRepeatMode: MediaSessionAutoRepeatMode = "none";
  private currentMetadata: MediaMetadata | null = null;
  private isCameraActive = false;
  private isMicrophoneActive = false;
  private currentPlaybackState: MediaSessionPlaybackState = "none";
  private position: Required<MediaPositionState> | null = null;
  private readonly actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler>();
  private readonly backend: MediaSessionBackend;
  private readonly stopListening: () => void;

  /** Made by `installMediaSession`. */
  constructor(backend: MediaSessionBackend) {
    super();
    this.backend = backend;
    this.stopListening = backend.onRequest(request => {
      this.receive(request);
    });
  }

  get metadata() {
    return this.currentMetadata;
  }

  set metadata(value: MediaMetadata | null) {
    const isInvalid = value !== null && !(value instanceof MediaMetadata);
    if (isInvalid) {
      throw new TypeError("Failed to set the 'metadata' property on 'MediaSession': The provided value is not of type 'MediaMetadata'.");
    }

    this.currentMetadata?.attach(undefined);
    this.currentMetadata = value;
    value?.attach(() => {
      this.update();
    });
    this.update();
  }

  get playbackState() {
    return this.currentPlaybackState;
  }

  set playbackState(value: MediaSessionPlaybackState) {
    const isValid = isPlaybackState(value);
    if (isValid) {
      this.currentPlaybackState = value;
      this.update();
    }
  }

  get onshufflechange() {
    return this.getHandler("shufflechange");
  }

  set onshufflechange(handler: EventListener | null) {
    this.setHandler({
      type: "shufflechange",
      handler
    });
  }

  get onrepeatchange() {
    return this.getHandler("repeatchange");
  }

  set onrepeatchange(handler: EventListener | null) {
    this.setHandler({
      type: "repeatchange",
      handler
    });
  }

  /**
   * Sets or clears the handler of an action; the overlay's button for that
   * action is enabled while it has one.
   *
   * @throws {TypeError} When the action is not a `MediaSessionAction`.
   */
  // eslint-disable-next-line no-restricted-syntax -- mirrors the Web API's positional signature
  setActionHandler(action: string, handler: MediaSessionActionHandler | null) {
    const isKnown = isSupportedAction(action) || STANDARD_ONLY_ACTIONS.includes(action);
    if (!isKnown) {
      throw new TypeError(`Failed to execute 'setActionHandler' on 'MediaSession': The provided value '${action}' is not a valid enum value of type MediaSessionAction.`);
    }

    if (isSupportedAction(action)) {
      this.setSupportedHandler({
        action,
        handler
      });
    }
  }

  /**
   * Tells the overlay where the playback is.
   *
   * @throws {TypeError} When the values cannot be a position, as the spec has it.
   */
  setPositionState(state?: MediaPositionState) {
    const isCleared = state === undefined || Object.keys(state).length === 0;
    if (isCleared) {
      this.position = null;
      this.update();
      return;
    }

    const { duration = 0, playbackRate = 1, position = 0 } = state;
    const isDurationInvalid = !(duration >= 0);
    const isRateInvalid = playbackRate === 0 || !Number.isFinite(playbackRate);
    const isPositionInvalid = !(position >= 0) || position > duration;
    const isInvalid = isDurationInvalid || isRateInvalid || isPositionInvalid;
    if (isInvalid) {
      throw new TypeError("Failed to execute 'setPositionState' on 'MediaSession': The provided position state is invalid.");
    }

    this.position = {
      duration,
      playbackRate,
      position
    };
    this.update();
  }

  /** Tells the backend; the Windows overlay has no camera indicator, so it shows nothing. */
  setCameraActive(isActive: boolean) {
    this.isCameraActive = isActive;
    this.update();
  }

  /** Tells the backend; the Windows overlay has no microphone indicator, so it shows nothing. */
  setMicrophoneActive(isActive: boolean) {
    this.isMicrophoneActive = isActive;
    this.update();
  }

  update() {
    const metadata = this.currentMetadata;
    this.backend.show({
      metadata: metadata === null ? null : {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: metadata.artwork,
        extras: metadata.extras
      },
      playbackState: this.currentPlaybackState,
      position: this.position,
      actions: new Set(this.actionHandlers.keys()),
      isShuffleEnabled: this.isShuffleEnabled,
      autoRepeatMode: this.autoRepeatMode,
      isCameraActive: this.isCameraActive,
      isMicrophoneActive: this.isMicrophoneActive
    });
  }

  /** Stops listening to the overlay and releases it. */
  dispose() {
    this.stopListening();
    this.backend.close();
  }

  get [Symbol.toStringTag]() {
    return "MediaSession";
  }

  private setSupportedHandler({ action, handler }: {
    action: MediaSessionAction;
    handler: MediaSessionActionHandler | null;
  }) {
    const isSet = typeof handler === "function";
    if (isSet) {
      this.actionHandlers.set(action, handler);
    } else {
      this.actionHandlers.delete(action);
    }

    this.update();
  }

  private receive(request: MediaSessionRequest) {
    const isShuffle = request.kind === "shuffle";
    if (isShuffle) {
      this.isShuffleEnabled = request.isEnabled;
      this.dispatchEvent(new Event("shufflechange"));
      return;
    }

    const isRepeat = request.kind === "repeat";
    if (isRepeat) {
      this.autoRepeatMode = request.mode;
      this.dispatchEvent(new Event("repeatchange"));
      return;
    }

    this.actionHandlers.get(request.details.action)?.(request.details);
  }
}

/** What `installMediaSession` takes. */
export interface MediaSessionInstallOptions {
  /** Stands in for the Windows overlay; the tests give one. */
  readonly backend?: MediaSessionBackend;

  /**
   * The `MediaPlayer` whose transport controls the overlay is; pass the one
   * `createMediaPlayer` made so the player's own state shows. Without it the
   * session owns a silent player.
   */
  readonly player?: MediaPlayer;
}

/**
 * Defines `navigator.mediaSession`, `MediaSession` and `MediaMetadata` over
 * the Windows media overlay (`SystemMediaTransportControls`). Nothing is
 * defined until this is called; call it on the thread the app's code runs on.
 *
 * @param options - A player to share, and test stand-ins.
 * @returns The function that takes them away again.
 */
export function installMediaSession(options: MediaSessionInstallOptions = {}) {
  const backend = options.backend ?? windowsMediaSessionBackend({ player: options.player });
  const session = new MediaSession(backend);
  const uninstalls = [
    defineNavigatorProperty({
      name: "mediaSession",
      value: session
    }),
    defineProperty({
      name: "MediaSession",
      value: MediaSession
    }),
    defineProperty({
      name: "MediaMetadata",
      value: MediaMetadata
    })
  ];
  return () => {
    session.dispose();
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
