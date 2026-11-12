import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { windowsSpeechSynthesisBackend } from "./speech-synthesis-source.ts";

const MILLISECONDS_PER_SECOND = 1000;
const MIN_RATE = 0.1;
const MAX_RATE = 10;
const MAX_PITCH = 2;

/** The `SpeechSynthesisErrorCode` values. */
export const SpeechSynthesisErrorCode = {
  CANCELED: "canceled",
  INTERRUPTED: "interrupted",
  AUDIO_BUSY: "audio-busy",
  AUDIO_HARDWARE: "audio-hardware",
  NETWORK: "network",
  SYNTHESIS_UNAVAILABLE: "synthesis-unavailable",
  SYNTHESIS_FAILED: "synthesis-failed",
  LANGUAGE_UNAVAILABLE: "language-unavailable",
  VOICE_UNAVAILABLE: "voice-unavailable",
  TEXT_TOO_LONG: "text-too-long",
  INVALID_ARGUMENT: "invalid-argument",
  NOT_ALLOWED: "not-allowed"
} as const;
/** One of the values of `SpeechSynthesisErrorCode`. */
export type SpeechSynthesisErrorCode = (typeof SpeechSynthesisErrorCode)[keyof typeof SpeechSynthesisErrorCode];

/** The gender a Windows voice has; WinUI-only. */
export type SpeechVoiceGender = "male" | "female";

/** How much silence Windows puts after punctuation or after an utterance. */
export type SpeechSilence = "default" | "minimal";

/** What Windows adds to a `SpeechSynthesisVoice`. */
export interface SpeechSynthesisVoiceExtras {
  /** The voice's gender. */
  readonly gender?: SpeechVoiceGender;

  /** The voice's description, such as `Microsoft David - English (United States)`. */
  readonly description?: string;
}

/** What Windows adds to a `SpeechSynthesisUtterance`; a browser ignores every member. */
export interface SpeechSynthesisUtteranceExtras {
  /**
   * Reads `text` as SSML (`<speak>...</speak>`). A `<bookmark>` raises a `mark` event only for a voice that
   * reports bookmarks; the Microsoft voices installed with Windows do not.
   */
  isSsml?: boolean;

  /** Silence after punctuation: Windows' `default`, or the `minimal` it offers. */
  punctuationSilence?: SpeechSilence;

  /** Silence after the utterance: Windows' `default`, or the `minimal` it offers. */
  appendedSilence?: SpeechSilence;
}

declare global {
  // The extras join the standard types wherever this module is imported.
  interface SpeechSynthesisVoice extends SpeechSynthesisVoiceExtras {}
  interface SpeechSynthesisUtterance extends SpeechSynthesisUtteranceExtras {}
}

/** A voice Windows has, as the backend reports it. */
export interface SpeechVoiceInfo {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly isDefault: boolean;
  readonly isLocal: boolean;
  readonly gender: SpeechVoiceGender;
  readonly description: string;
}

/** One utterance as the backend is asked to speak it. */
export interface SpeechRequest {
  readonly text: string;
  readonly isSsml: boolean;
  readonly voiceId: string | undefined;
  readonly language: string;
  readonly rate: number;
  readonly pitch: number;
  readonly volume: number;
  readonly punctuationSilence: SpeechSilence;
  readonly appendedSilence: SpeechSilence;
}

/** A word, sentence or SSML bookmark the speech reached. */
export interface SpeechBoundary {
  readonly kind: "word" | "sentence" | "mark";
  readonly text: string;
}

/** What the backend tells about an utterance it speaks. */
export interface SpeechListener {
  onStart(): void;
  onBoundary(boundary: SpeechBoundary): void;
  onEnd(): void;
  onError(code: SpeechSynthesisErrorCode): void;
}

/** What the page can do to an utterance being spoken. */
export interface SpeechControl {
  pause(): void;
  resume(): void;
  cancel(): void;
}

/** What `speechSynthesis` speaks with: Windows' `SpeechSynthesizer` in the app, a fake in the tests. */
export interface SpeechSynthesisBackend {
  voices(): readonly SpeechVoiceInfo[];
  speak(options: {
    request: SpeechRequest;
    listener: SpeechListener;
  }): SpeechControl;
}

/** The standard `SpeechSynthesisVoice`. */
export class SpeechSynthesisVoice {
  readonly voiceURI: string;
  readonly name: string;
  readonly lang: string;
  readonly localService: boolean;
  readonly default: boolean;
  readonly gender: SpeechVoiceGender;
  readonly description: string;

  /** Made by `speechSynthesis.getVoices()`. */
  constructor(info: SpeechVoiceInfo) {
    this.voiceURI = info.id;
    this.name = info.name;
    this.lang = info.language;
    this.localService = info.isLocal;
    this.default = info.isDefault;
    this.gender = info.gender;
    this.description = info.description;
  }

  get [Symbol.toStringTag]() {
    return "SpeechSynthesisVoice";
  }
}

/** What `new SpeechSynthesisEvent(type, init)` takes. */
export interface SpeechSynthesisEventInit extends EventInit {
  readonly utterance: SpeechSynthesisUtterance;
  readonly charIndex?: number;
  readonly charLength?: number;
  readonly elapsedTime?: number;
  readonly name?: string;
}

/** The event of an utterance: `start`, `end`, `pause`, `resume`, `mark` and `boundary`. */
export class SpeechSynthesisEvent extends Event {
  readonly utterance: SpeechSynthesisUtterance;
  readonly charIndex: number;
  readonly charLength: number;
  readonly elapsedTime: number;
  readonly name: string;

  constructor(type: string, init: SpeechSynthesisEventInit) {
    super(type, init);
    this.utterance = init.utterance;
    this.charIndex = init.charIndex ?? 0;
    this.charLength = init.charLength ?? 0;
    this.elapsedTime = init.elapsedTime ?? 0;
    this.name = init.name ?? "";
  }
}

/** The `error` event of an utterance. */
export class SpeechSynthesisErrorEvent extends SpeechSynthesisEvent {
  readonly error: SpeechSynthesisErrorCode;

  constructor(type: string, init: SpeechSynthesisEventInit & { readonly error: SpeechSynthesisErrorCode }) {
    super(type, init);
    this.error = init.error;
  }
}

/** The standard `SpeechSynthesisUtterance`: a text to speak, and how. */
export class SpeechSynthesisUtterance extends HandlerEventTarget {
  text: string;
  lang = "";
  voice: Pick<SpeechSynthesisVoice, "voiceURI"> | null = null;
  volume = 1;
  rate = 1;
  pitch = 1;
  isSsml = false;
  punctuationSilence: SpeechSilence = "default";
  appendedSilence: SpeechSilence = "default";

  constructor(text = "") {
    super();
    this.text = String(text);
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

  get onend() {
    return this.getHandler("end");
  }

  set onend(handler: EventListener | null) {
    this.setHandler({
      type: "end",
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

  get onpause() {
    return this.getHandler("pause");
  }

  set onpause(handler: EventListener | null) {
    this.setHandler({
      type: "pause",
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

  get onmark() {
    return this.getHandler("mark");
  }

  set onmark(handler: EventListener | null) {
    this.setHandler({
      type: "mark",
      handler
    });
  }

  get onboundary() {
    return this.getHandler("boundary");
  }

  set onboundary(handler: EventListener | null) {
    this.setHandler({
      type: "boundary",
      handler
    });
  }

  get [Symbol.toStringTag]() {
    return "SpeechSynthesisUtterance";
  }
}

interface ActiveSpeech {
  readonly utterance: SpeechSynthesisUtterance;
  control: SpeechControl;
  readonly startedAt: number;
  searchFrom: number;
}

const IDLE_CONTROL = {
  pause: () => undefined,
  resume: () => undefined,
  cancel: () => undefined
} satisfies SpeechControl;

function clamp({ value, minimum, maximum }: {
  value: number;
  minimum: number;
  maximum: number;
}) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** The `speechSynthesis` object. */
export class SpeechSynthesis extends HandlerEventTarget {
  private readonly queue: SpeechSynthesisUtterance[] = [];
  private active: ActiveSpeech | undefined;
  private isPausedNow = false;
  private readonly backend: SpeechSynthesisBackend;

  /** Made by `installSpeechSynthesis`. */
  constructor(backend: SpeechSynthesisBackend) {
    super();
    this.backend = backend;
  }

  get speaking() {
    return this.active !== undefined;
  }

  get pending() {
    return this.queue.length > 0;
  }

  get paused() {
    return this.isPausedNow;
  }

  get onvoiceschanged() {
    return this.getHandler("voiceschanged");
  }

  set onvoiceschanged(handler: EventListener | null) {
    this.setHandler({
      type: "voiceschanged",
      handler
    });
  }

  /** The voices Windows has installed. */
  getVoices() {
    return this.backend.voices().map(info => new SpeechSynthesisVoice(info));
  }

  /**
   * Queues an utterance; it is spoken when the ones before it are done.
   *
   * @throws {TypeError} When the argument is not a `SpeechSynthesisUtterance`.
   */
  speak(utterance: SpeechSynthesisUtterance) {
    const isUtterance = utterance instanceof SpeechSynthesisUtterance;
    if (!isUtterance) {
      throw new TypeError("Failed to execute 'speak' on 'SpeechSynthesis': parameter 1 is not of type 'SpeechSynthesisUtterance'.");
    }

    this.queue.push(utterance);
    this.next();
  }

  /** Drops the queue and stops what is spoken; the spoken utterance gets an `error` event, `canceled`. */
  cancel() {
    this.queue.length = 0;
    this.isPausedNow = false;
    const speech = this.active;
    this.active = undefined;

    const hasSpeech = speech !== undefined;
    if (hasSpeech) {
      speech.control.cancel();
      this.fireError({
        speech,
        code: SpeechSynthesisErrorCode.CANCELED
      });
    }
  }

  /** Pauses what is spoken; nothing starts until `resume()`. */
  pause() {
    const isAlreadyPaused = this.isPausedNow;
    if (isAlreadyPaused) {
      return;
    }

    this.isPausedNow = true;
    const speech = this.active;
    const hasSpeech = speech !== undefined;
    if (hasSpeech) {
      speech.control.pause();
      this.fire({
        speech,
        type: "pause"
      });
    }
  }

  /** Goes on speaking after `pause()`. */
  resume() {
    const isRunning = !this.isPausedNow;
    if (isRunning) {
      return;
    }

    this.isPausedNow = false;
    const speech = this.active;
    const isIdle = speech === undefined;
    if (isIdle) {
      this.next();
      return;
    }

    speech.control.resume();
    this.fire({
      speech,
      type: "resume"
    });
  }

  get [Symbol.toStringTag]() {
    return "SpeechSynthesis";
  }

  private next() {
    const isBusy = this.active !== undefined || this.isPausedNow;
    if (isBusy) {
      return;
    }

    const utterance = this.queue.shift();
    const hasUtterance = utterance !== undefined;
    if (hasUtterance) {
      this.begin(utterance);
    }
  }

  private begin(utterance: SpeechSynthesisUtterance) {
    const speech: ActiveSpeech = {
      utterance,
      control: IDLE_CONTROL,
      startedAt: Date.now(),
      searchFrom: 0
    };
    const isEmpty = utterance.text === "";
    if (isEmpty) {
      this.fire({
        speech,
        type: "start"
      });
      this.fire({
        speech,
        type: "end"
      });
      this.next();
      return;
    }

    this.active = speech;
    speech.control = this.backend.speak({
      request: this.requestOf(utterance),
      listener: {
        onStart: () => {
          this.fire({
            speech,
            type: "start"
          });
        },
        onBoundary: boundary => {
          this.boundary({
            speech,
            boundary
          });
        },
        onEnd: () => {
          this.finish(speech);
        },
        onError: code => {
          this.fail({
            speech,
            code
          });
        }
      }
    });
  }

  private requestOf(utterance: SpeechSynthesisUtterance) {
    return {
      text: utterance.text,
      isSsml: utterance.isSsml,
      voiceId: utterance.voice?.voiceURI,
      language: utterance.lang,
      rate: clamp({
        value: utterance.rate,
        minimum: MIN_RATE,
        maximum: MAX_RATE
      }),
      pitch: clamp({
        value: utterance.pitch,
        minimum: 0,
        maximum: MAX_PITCH
      }),
      volume: clamp({
        value: utterance.volume,
        minimum: 0,
        maximum: 1
      }),
      punctuationSilence: utterance.punctuationSilence,
      appendedSilence: utterance.appendedSilence
    } satisfies SpeechRequest;
  }

  private fire({ speech, type, init = {} }: {
    speech: ActiveSpeech;
    type: string;
    init?: Partial<SpeechSynthesisEventInit>;
  }) {
    speech.utterance.dispatchEvent(
      new SpeechSynthesisEvent(type, {
        utterance: speech.utterance,
        elapsedTime: (Date.now() - speech.startedAt) / MILLISECONDS_PER_SECOND,
        ...init
      })
    );
  }

  private fireError({ speech, code }: {
    speech: ActiveSpeech;
    code: SpeechSynthesisErrorCode;
  }) {
    speech.utterance.dispatchEvent(
      new SpeechSynthesisErrorEvent("error", {
        utterance: speech.utterance,
        elapsedTime: (Date.now() - speech.startedAt) / MILLISECONDS_PER_SECOND,
        error: code
      })
    );
  }

  private boundary({ speech, boundary }: {
    speech: ActiveSpeech;
    boundary: SpeechBoundary;
  }) {
    const isMark = boundary.kind === "mark";
    if (isMark) {
      this.fire({
        speech,
        type: "mark",
        init: {
          name: boundary.text
        }
      });
      return;
    }

    const found = speech.utterance.text.indexOf(boundary.text, speech.searchFrom);
    const isFound = found >= 0;
    const charIndex = isFound ? found : speech.searchFrom;
    speech.searchFrom = charIndex + (boundary.kind === "word" ? boundary.text.length : 0);
    this.fire({
      speech,
      type: "boundary",
      init: {
        name: boundary.kind,
        charIndex,
        charLength: boundary.text.length
      }
    });
  }

  private finish(speech: ActiveSpeech) {
    const isStale = this.active !== speech;
    if (isStale) {
      return;
    }

    this.active = undefined;
    this.fire({
      speech,
      type: "end"
    });
    this.next();
  }

  private fail({ speech, code }: {
    speech: ActiveSpeech;
    code: SpeechSynthesisErrorCode;
  }) {
    const isStale = this.active !== speech;
    if (isStale) {
      return;
    }

    this.active = undefined;
    this.fireError({
      speech,
      code
    });
    this.next();
  }
}

/** What `installSpeechSynthesis` takes. */
export interface SpeechSynthesisInstallOptions {
  /** Stands in for Windows' `SpeechSynthesizer`; the tests give one. */
  readonly backend?: SpeechSynthesisBackend;
}

/**
 * Defines `speechSynthesis`, `SpeechSynthesisUtterance`, `SpeechSynthesisVoice`
 * and the event classes over Windows' `SpeechSynthesizer`, played through a
 * `MediaPlayer`. Nothing is defined until this is called; call it on the
 * thread the app's code runs on.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes them away again.
 */
export function installSpeechSynthesis(options: SpeechSynthesisInstallOptions = {}) {
  const backend = options.backend ?? windowsSpeechSynthesisBackend();
  const synthesis = new SpeechSynthesis(backend);
  const uninstalls = [
    defineProperty({
      name: "speechSynthesis",
      value: synthesis
    }),
    defineProperty({
      name: "SpeechSynthesis",
      value: SpeechSynthesis
    }),
    defineProperty({
      name: "SpeechSynthesisUtterance",
      value: SpeechSynthesisUtterance
    }),
    defineProperty({
      name: "SpeechSynthesisVoice",
      value: SpeechSynthesisVoice
    }),
    defineProperty({
      name: "SpeechSynthesisEvent",
      value: SpeechSynthesisEvent
    }),
    defineProperty({
      name: "SpeechSynthesisErrorEvent",
      value: SpeechSynthesisErrorEvent
    })
  ];
  queueMicrotask(() => {
    synthesis.dispatchEvent(new Event("voiceschanged"));
  });
  return () => {
    synthesis.cancel();
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
