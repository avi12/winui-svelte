import type {
  SpeechBoundary,
  SpeechControl,
  SpeechListener,
  SpeechRequest,
  SpeechSynthesisBackend,
  SpeechVoiceInfo
} from "./speech-synthesis.ts";
import { startTimer } from "#src/window/timers.js";
import { MediaSource } from "#winui/windows/media/core/MediaSource";
import { IMediaPlaybackSource } from "#winui/windows/media/playback/IMediaPlaybackSource";
import { MediaPlaybackState } from "#winui/windows/media/playback/MediaPlaybackState";
import { MediaPlayer } from "#winui/windows/media/playback/MediaPlayer";
import { SpeechAppendedSilence } from "#winui/windows/media/speech-synthesis/SpeechAppendedSilence";
import { SpeechPunctuationSilence } from "#winui/windows/media/speech-synthesis/SpeechPunctuationSilence";
import { SpeechSynthesizer } from "#winui/windows/media/speech-synthesis/SpeechSynthesizer";
import { VoiceGender } from "#winui/windows/media/speech-synthesis/VoiceGender";
import type { VoiceInformation } from "#winui/windows/media/speech-synthesis/VoiceInformation";

const TICKS_PER_MILLISECOND = 10_000n;
const NO_TICKS = 0n;
const POLL_MILLISECONDS = 50;
const MIN_SPEAKING_RATE = 0.5;
const MAX_SPEAKING_RATE = 6;
const SENTENCE_MARKER = "SentenceBoundary";
const WORD_MARKER = "WordBoundary";
const ONLINE_VOICE_PATTERN = /online|natural/iu;

/** A boundary of rendered speech, with the time it is spoken at. */
export interface RenderedBoundary extends SpeechBoundary {
  readonly milliseconds: number;
}

/** Speech turned into audio without playing it. */
export interface RenderedSpeech {
  readonly boundaries: readonly RenderedBoundary[];
  readonly contentType: string;
  readonly byteLength: number;
}

interface PlaybackControl {
  player: MediaPlayer | undefined;
  stopPolling: () => void;
  isCanceled: boolean;
}

function voiceInfoOf({ voice, defaultId }: {
  voice: VoiceInformation;
  defaultId: string;
}) {
  return {
    id: voice.id,
    name: voice.displayName,
    language: voice.language,
    isDefault: voice.id === defaultId,
    isLocal: !ONLINE_VOICE_PATTERN.test(voice.id),
    gender: voice.gender === VoiceGender.Female ? "female" : "male",
    description: voice.description
  } satisfies SpeechVoiceInfo;
}

function allVoices() {
  return [...(SpeechSynthesizer.allVoices ?? [])];
}

function voiceOf(request: SpeechRequest) {
  const voices = allVoices();
  const language = request.language.toLowerCase();
  const hasLanguage = language !== "";
  return voices.find(voice => voice.id === request.voiceId)
    ?? (hasLanguage ? voices.find(voice => voice.language.toLowerCase().startsWith(language)) : undefined);
}

function boundaryOf(marker: {
  time: { duration: bigint };
  mediaMarkerType: string;
  text: string;
}) {
  const kinds = new Map([[WORD_MARKER, "word" as const], [SENTENCE_MARKER, "sentence" as const]]);
  return {
    kind: kinds.get(marker.mediaMarkerType) ?? "mark" as const,
    text: marker.text,
    milliseconds: Number(marker.time.duration / TICKS_PER_MILLISECOND)
  } satisfies RenderedBoundary;
}

function configure({ synthesizer, request }: {
  synthesizer: SpeechSynthesizer;
  request: SpeechRequest;
}) {
  const options = synthesizer.options;
  options.includeWordBoundaryMetadata = true;
  options.includeSentenceBoundaryMetadata = true;
  options.audioVolume = request.volume;
  options.audioPitch = request.pitch;
  options.speakingRate = Math.min(MAX_SPEAKING_RATE, Math.max(MIN_SPEAKING_RATE, request.rate));
  options.punctuationSilence = request.punctuationSilence === "minimal" ? SpeechPunctuationSilence.Min : SpeechPunctuationSilence.Default;
  options.appendedSilence = request.appendedSilence === "minimal" ? SpeechAppendedSilence.Min : SpeechAppendedSilence.Default;
  const voice = voiceOf(request);
  const hasVoice = voice !== undefined;
  if (hasVoice) {
    synthesizer.voice = voice;
  }
}

async function synthesize(request: SpeechRequest) {
  const synthesizer = new SpeechSynthesizer();
  try {
    configure({
      synthesizer,
      request
    });

    if (request.isSsml) {
      return await synthesizer.synthesizeSsmlToStreamAsync(request.text);
    }

    return await synthesizer.synthesizeTextToStreamAsync(request.text);
  } finally {
    synthesizer.close();
  }
}

/**
 * Turns an utterance into audio without playing it: nothing is audible, and
 * the word, sentence and bookmark boundaries come with the time they are
 * spoken at.
 *
 * @param request - What to speak, and how.
 * @returns The boundaries, the audio's media type and its size in bytes.
 */
export async function renderSpeech(request: SpeechRequest) {
  const stream = await synthesize(request);
  const markers = [...(stream.markers ?? [])];
  const result = {
    boundaries: markers.map(marker => boundaryOf(marker)),
    contentType: stream.contentType,
    byteLength: Number(stream.size)
  } satisfies RenderedSpeech;
  stream.close();
  return result;
}

function isEnded(player: MediaPlayer) {
  const { playbackSession } = player;
  const isKnown = playbackSession.naturalDuration.duration > NO_TICKS;
  const isAtEnd = playbackSession.position.duration >= playbackSession.naturalDuration.duration;
  return isKnown && isAtEnd && playbackSession.playbackState === MediaPlaybackState.Paused;
}

async function play({ request, listener, control }: {
  request: SpeechRequest;
  listener: SpeechListener;
  control: PlaybackControl;
}) {
  const stream = await synthesize(request);
  const boundaries = [...(stream.markers ?? [])].map(marker => boundaryOf(marker));
  if (control.isCanceled) {
    stream.close();
    return;
  }

  const player = new MediaPlayer();
  control.player = player;
  const source = MediaSource.createFromStream(stream, stream.contentType);
  player.source = IMediaPlaybackSource.from(source);
  let iNext = 0;
  let isStarted = false;
  control.stopPolling = startTimer({
    milliseconds: POLL_MILLISECONDS,
    onTick() {
      const position = Number(player.playbackSession.position.duration / TICKS_PER_MILLISECOND);
      const isPlaying = player.playbackSession.playbackState === MediaPlaybackState.Playing;
      const isStarting = isPlaying && !isStarted;
      if (isStarting) {
        isStarted = true;
        listener.onStart();
      }

      const due = boundaries.slice(iNext).filter(boundary => boundary.milliseconds <= position);
      iNext += due.length;
      for (const boundary of due) {
        listener.onBoundary(boundary);
      }

      const hasEnded = isStarted && isEnded(player);
      if (hasEnded) {
        control.stopPolling();
        player.close();
        listener.onEnd();
      }
    }
  });
  player.play();
}

/**
 * The backend over Windows' `SpeechSynthesizer`: each utterance is rendered
 * into a `SpeechSynthesisStream` and played by a `MediaPlayer` of its own,
 * with the stream's markers raised as the position passes them (polled on the
 * UI thread, because MediaPlayer raises its events on a thread of its own).
 *
 * @returns The backend.
 */
export function windowsSpeechSynthesisBackend() {
  const backend = {
    voices() {
      const defaultId = SpeechSynthesizer.defaultVoice.id;
      return allVoices().map(voice => voiceInfoOf({
        voice,
        defaultId
      }));
    },
    speak({ request, listener }) {
      const control: PlaybackControl = {
        player: undefined,
        stopPolling: () => undefined,
        isCanceled: false
      };
      play({
        request,
        listener,
        control
      }).catch((error: unknown) => {
        const isVoiceProblem = error instanceof Error && /voice/iu.test(error.message);
        const code = isVoiceProblem ? "voice-unavailable" : "synthesis-failed";
        listener.onError(code);
      });
      return {
        pause() {
          control.player?.pause();
        },
        resume() {
          control.player?.play();
        },
        cancel() {
          control.isCanceled = true;
          control.stopPolling();
          control.player?.close();
        }
      } satisfies SpeechControl;
    }
  } satisfies SpeechSynthesisBackend;
  return backend;
}
