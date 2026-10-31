import type {
  MediaMetadataExtras,
  MediaSessionAction,
  MediaSessionAutoRepeatMode,
  MediaSessionBackend,
  MediaSessionPlaybackState,
  MediaSessionRequest,
  MediaSessionSnapshot
} from "./media-session.ts";
import { Uri } from "#src/winui.js";
import { MediaPlaybackAutoRepeatMode } from "#winui/windows/media/MediaPlaybackAutoRepeatMode";
import { MediaPlaybackStatus } from "#winui/windows/media/MediaPlaybackStatus";
import { MediaPlaybackType } from "#winui/windows/media/MediaPlaybackType";
import { MediaPlayer } from "#winui/windows/media/playback/MediaPlayer";
import { SystemMediaTransportControlsButton } from "#winui/windows/media/SystemMediaTransportControlsButton";
import {
  SystemMediaTransportControlsTimelineProperties
} from "#winui/windows/media/SystemMediaTransportControlsTimelineProperties";
import { RandomAccessStreamReference } from "#winui/windows/storage/streams/RandomAccessStreamReference";

const TICKS_PER_SECOND = 10_000_000;

const playbackStatuses = {
  none: MediaPlaybackStatus.Closed,
  paused: MediaPlaybackStatus.Paused,
  playing: MediaPlaybackStatus.Playing
} satisfies Record<MediaSessionPlaybackState, number>;

const mediaTypes = {
  music: MediaPlaybackType.Music,
  video: MediaPlaybackType.Video,
  image: MediaPlaybackType.Image
} as const;

const repeatModes = {
  none: MediaPlaybackAutoRepeatMode.None,
  track: MediaPlaybackAutoRepeatMode.Track,
  list: MediaPlaybackAutoRepeatMode.List
} satisfies Record<MediaSessionAutoRepeatMode, number>;

const buttonOfAction = new Map<MediaSessionAction, number>([
  ["play", SystemMediaTransportControlsButton.Play],
  ["pause", SystemMediaTransportControlsButton.Pause],
  ["stop", SystemMediaTransportControlsButton.Stop],
  ["nexttrack", SystemMediaTransportControlsButton.Next],
  ["previoustrack", SystemMediaTransportControlsButton.Previous],
  ["seekforward", SystemMediaTransportControlsButton.FastForward],
  ["seekbackward", SystemMediaTransportControlsButton.Rewind]
]);

const enabledPropertyOfAction = new Map<MediaSessionAction, "isPlayEnabled" | "isPauseEnabled" | "isStopEnabled" | "isNextEnabled" | "isPreviousEnabled" | "isFastForwardEnabled" | "isRewindEnabled">([
  ["play", "isPlayEnabled"],
  ["pause", "isPauseEnabled"],
  ["stop", "isStopEnabled"],
  ["nexttrack", "isNextEnabled"],
  ["previoustrack", "isPreviousEnabled"],
  ["seekforward", "isFastForwardEnabled"],
  ["seekbackward", "isRewindEnabled"]
]);

const actionOfButton = new Map<number, MediaSessionAction>(
  [...buttonOfAction].map(([action, button]) => [button, action])
);

function timeSpanOf(seconds: number) {
  return { duration: BigInt(Math.round(seconds * TICKS_PER_SECOND)) };
}

function secondsOf(timeSpan: { duration: bigint }) {
  return Number(timeSpan.duration) / TICKS_PER_SECOND;
}

function repeatModeOf(value: number) {
  const isTrack = value === MediaPlaybackAutoRepeatMode.Track;
  if (isTrack) {
    return "track" as const;
  }

  const isList = value === MediaPlaybackAutoRepeatMode.List;
  return isList ? "list" as const : "none" as const;
}

function showMetadata({ updater, metadata }: {
  updater: MediaPlayer["systemMediaTransportControls"]["displayUpdater"];
  metadata: NonNullable<MediaSessionSnapshot["metadata"]>;
}) {
  const extras: MediaMetadataExtras = metadata.extras;
  const mediaType = extras.mediaType ?? "music";
  updater.type = mediaTypes[mediaType];
  const isVideo = mediaType === "video";
  const isMusic = mediaType === "music";
  if (isVideo) {
    updater.videoProperties.title = metadata.title;
    updater.videoProperties.subtitle = extras.subtitle ?? metadata.artist;
  }

  if (isMusic) {
    const properties = updater.musicProperties;
    properties.title = metadata.title;
    properties.artist = metadata.artist;
    properties.albumTitle = metadata.album;
    properties.albumArtist = extras.albumArtist ?? metadata.artist;
    properties.trackNumber = extras.trackNumber ?? 0;
    properties.albumTrackCount = extras.albumTrackCount ?? 0;
  }

  const [artwork] = metadata.artwork;
  const hasArtwork = artwork !== undefined;
  if (hasArtwork) {
    updater.thumbnail = RandomAccessStreamReference.createFromUri(new Uri(artwork.src));
  }
}

function showPosition({ controls, position }: {
  controls: MediaPlayer["systemMediaTransportControls"];
  position: NonNullable<MediaSessionSnapshot["position"]>;
}) {
  const timeline = new SystemMediaTransportControlsTimelineProperties();
  timeline.startTime = timeSpanOf(0);
  timeline.endTime = timeSpanOf(position.duration);
  timeline.minSeekTime = timeSpanOf(0);
  timeline.maxSeekTime = timeSpanOf(position.duration);
  timeline.position = timeSpanOf(position.position);
  controls.updateTimelineProperties(timeline);
  controls.playbackRate = position.playbackRate;
}

/**
 * The backend over the Windows media overlay: the
 * `SystemMediaTransportControls` of a `MediaPlayer`. Nothing is created until
 * the page first sets something. Overlay events are raised on a thread of
 * their own; where the bindings do not deliver one the overlay shows the state
 * but its buttons do not reach the page.
 *
 * @param options - The player to use; without one a silent player is made.
 * @returns The backend.
 */
export function windowsMediaSessionBackend({ player }: {
  player?: MediaPlayer | undefined;
}) {
  let owned: MediaPlayer | undefined;
  let subscriptions: Array<() => void> = [];
  const callbacks = new Set<(request: MediaSessionRequest) => void>();

  function raise(request: MediaSessionRequest) {
    for (const callback of callbacks) {
      callback(request);
    }
  }

  function controlsOf() {
    const hasPlayer = player !== undefined;
    if (hasPlayer) {
      return player.systemMediaTransportControls;
    }

    owned ??= new MediaPlayer();
    owned.commandManager.isEnabled = false;
    return owned.systemMediaTransportControls;
  }

  function subscribe(controls: MediaPlayer["systemMediaTransportControls"]) {
    subscriptions = [
      controls.onButtonPressed((_sender, args) => {
        const action = actionOfButton.get(args.button);
        const isMapped = action !== undefined;
        if (isMapped) {
          raise({
            kind: "action",
            details: {
              action
            }
          });
        }
      }),
      controls.onPlaybackPositionChangeRequested((_sender, args) => {
        raise({
          kind: "action",
          details: {
            action: "seekto",
            seekTime: secondsOf(args.requestedPlaybackPosition)
          }
        });
      }),
      controls.onShuffleEnabledChangeRequested((_sender, args) => {
        raise({
          kind: "shuffle",
          isEnabled: args.requestedShuffleEnabled
        });
      }),
      controls.onAutoRepeatModeChangeRequested((_sender, args) => {
        raise({
          kind: "repeat",
          mode: repeatModeOf(args.requestedAutoRepeatMode)
        });
      })
    ];
  }

  const backend = {
    show(snapshot) {
      const controls = controlsOf();
      const isFirst = subscriptions.length === 0;
      if (isFirst) {
        subscribe(controls);
      }

      controls.isEnabled = true;
      controls.playbackStatus = playbackStatuses[snapshot.playbackState];
      for (const [action, property] of enabledPropertyOfAction) {
        controls[property] = snapshot.actions.has(action);
      }

      controls.shuffleEnabled = snapshot.isShuffleEnabled;
      controls.autoRepeatMode = repeatModes[snapshot.autoRepeatMode];
      const updater = controls.displayUpdater;
      updater.clearAll();

      const hasMetadata = snapshot.metadata !== null;
      if (hasMetadata) {
        showMetadata({
          updater,
          metadata: snapshot.metadata
        });
      }

      updater.update();

      const hasPosition = snapshot.position !== null;
      if (hasPosition) {
        showPosition({
          controls,
          position: snapshot.position
        });
      }
    },
    onRequest(callback) {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
    close() {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }

      subscriptions = [];
      owned?.close();
      owned = undefined;
    }
  } satisfies MediaSessionBackend;
  return backend;
}
