import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { MediaPermission, windowsMediaAccess } from "./media-access.ts";
import { PermissionStateName } from "./permissions.ts";
import { windowsSpeechRecognitionBackend } from "./speech-recognition-source.ts";

/** The `SpeechRecognitionErrorCode` values. */
export const SpeechRecognitionErrorCode = {
  NO_SPEECH: "no-speech",
  ABORTED: "aborted",
  AUDIO_CAPTURE: "audio-capture",
  NETWORK: "network",
  NOT_ALLOWED: "not-allowed",
  SERVICE_NOT_ALLOWED: "service-not-allowed",
  BAD_GRAMMAR: "bad-grammar",
  LANGUAGE_NOT_SUPPORTED: "language-not-supported"
} as const;
/** One of the values of `SpeechRecognitionErrorCode`. */
export type SpeechRecognitionErrorCode = (typeof SpeechRecognitionErrorCode)[keyof typeof SpeechRecognitionErrorCode];

/** What the recognizer is listening for; WinUI-only. */
export type SpeechRecognitionScenario = "dictation" | "web-search" | "form-filling";

/** What Windows adds to a `SpeechRecognition`; a browser ignores every member. */
export interface SpeechRecognitionExtras {
  /** What the speech is for: free `dictation` (the default), a `web-search` query or `form-filling`. */
  scenario?: SpeechRecognitionScenario;

  /** Words or phrases the speech is expected to be one of; the result is then one of them. */
  phrases?: readonly string[];
}

declare global {
  // The extras join the standard type wherever this module is imported.
  interface SpeechRecognition extends SpeechRecognitionExtras {}
}

/** What a recognizer is started with. */
export interface RecognitionOptions {
  readonly language: string;
  readonly isContinuous: boolean;
  readonly isInterimEnabled: boolean;
  readonly maxAlternatives: number;
  readonly scenario: SpeechRecognitionScenario;
  readonly phrases: readonly string[];
}

/** One heard alternative. */
export interface HeardAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

/** How a recognition ended, in the spec's terms. */
export type RecognitionEnding = SpeechRecognitionErrorCode | "completed";

/** What the backend tells about a recognition it runs. */
export interface RecognitionListener {
  onAudioStart(): void;
  onSpeechStart(): void;
  onInterim(transcript: string): void;
  onFinal(alternatives: readonly HeardAlternative[]): void;
  onEnd(ending: RecognitionEnding): void;
}

/** What the page can do to a recognition in progress. */
export interface RecognitionControl {
  stop(): void;
  abort(): void;
}

/** What `SpeechRecognition` listens with: Windows' `SpeechRecognizer` in the app, a fake in the tests. */
export interface SpeechRecognitionBackend {
  access(): PermissionStateName;
  start(options: {
    options: RecognitionOptions;
    listener: RecognitionListener;
  }): RecognitionControl;
}

/** The standard `SpeechRecognitionAlternative`. */
export class SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;

  /** Made by the recognizer. */
  constructor(alternative: HeardAlternative) {
    this.transcript = alternative.transcript;
    this.confidence = alternative.confidence;
  }
}

/** The standard `SpeechRecognitionResult`: the alternatives heard for one phrase, indexable. */
export class SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternative;

  /** Made by the recognizer. */
  constructor({ alternatives, isFinal }: {
    alternatives: readonly HeardAlternative[];
    isFinal: boolean;
  }) {
    this.isFinal = isFinal;
    this.length = alternatives.length;
    for (const [i, alternative] of alternatives.entries()) {
      Object.defineProperty(this, i, {
        value: new SpeechRecognitionAlternative(alternative),
        enumerable: true
      });
    }
  }

  /** The alternative at an index, or `null`. */
  item(index: number) {
    return this[index] ?? null;
  }
}

/** The standard `SpeechRecognitionResultList`. */
export class SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;

  /** Made by the recognizer. */
  constructor(results: readonly SpeechRecognitionResult[]) {
    this.length = results.length;
    for (const [i, result] of results.entries()) {
      Object.defineProperty(this, i, {
        value: result,
        enumerable: true
      });
    }
  }

  /** The result at an index, or `null`. */
  item(index: number) {
    return this[index] ?? null;
  }
}

/** The `result` and `nomatch` event. */
export class SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;

  constructor(type: string, init: {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }) {
    super(type);
    this.resultIndex = init.resultIndex;
    this.results = init.results;
  }
}

/** The `error` event. */
export class SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;

  constructor(type: string, init: {
    error: SpeechRecognitionErrorCode;
    message?: string;
  }) {
    super(type);
    this.error = init.error;
    this.message = init.message ?? "";
  }
}

/** The standard `SpeechGrammarList`; Windows takes the extra `phrases` instead of grammars. */
export class SpeechGrammarList {
  private readonly grammars: Array<{
    src: string;
    weight: number;
  }> = [];

  get length() {
    return this.grammars.length;
  }

  /** Adds a grammar by text. */
  addFromString(grammar: string, weight = 1) {
    this.grammars.push({
      src: grammar,
      weight
    });
  }

  /** Adds a grammar by address. */
  addFromURI(src: string, weight = 1) {
    this.grammars.push({
      src,
      weight
    });
  }
}

/** The standard `SpeechRecognition`: listens to the microphone and reports what was said. */
export class SpeechRecognition extends HandlerEventTarget {
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  grammars = new SpeechGrammarList();
  scenario: SpeechRecognitionScenario = "dictation";
  phrases: readonly string[] = [];
  private control: RecognitionControl | undefined;
  private finals: SpeechRecognitionResult[] = [];
  private isSpeechHeard = false;
  private isAudioStarted = false;
  private readonly backend: SpeechRecognitionBackend;

  /** Made by `new SpeechRecognition()` once `installSpeechRecognition` ran. */
  constructor(backend: SpeechRecognitionBackend) {
    super();
    this.backend = backend;
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

  get onaudiostart() {
    return this.getHandler("audiostart");
  }

  set onaudiostart(handler: EventListener | null) {
    this.setHandler({
      type: "audiostart",
      handler
    });
  }

  get onsoundstart() {
    return this.getHandler("soundstart");
  }

  set onsoundstart(handler: EventListener | null) {
    this.setHandler({
      type: "soundstart",
      handler
    });
  }

  get onspeechstart() {
    return this.getHandler("speechstart");
  }

  set onspeechstart(handler: EventListener | null) {
    this.setHandler({
      type: "speechstart",
      handler
    });
  }

  get onspeechend() {
    return this.getHandler("speechend");
  }

  set onspeechend(handler: EventListener | null) {
    this.setHandler({
      type: "speechend",
      handler
    });
  }

  get onsoundend() {
    return this.getHandler("soundend");
  }

  set onsoundend(handler: EventListener | null) {
    this.setHandler({
      type: "soundend",
      handler
    });
  }

  get onaudioend() {
    return this.getHandler("audioend");
  }

  set onaudioend(handler: EventListener | null) {
    this.setHandler({
      type: "audioend",
      handler
    });
  }

  get onresult() {
    return this.getHandler("result");
  }

  set onresult(handler: EventListener | null) {
    this.setHandler({
      type: "result",
      handler
    });
  }

  get onnomatch() {
    return this.getHandler("nomatch");
  }

  set onnomatch(handler: EventListener | null) {
    this.setHandler({
      type: "nomatch",
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

  get onend() {
    return this.getHandler("end");
  }

  set onend(handler: EventListener | null) {
    this.setHandler({
      type: "end",
      handler
    });
  }

  /**
   * Starts listening. A denied microphone ends with a `not-allowed` error.
   *
   * @throws {DOMException} `InvalidStateError` when it already listens.
   */
  start() {
    const isListening = this.control !== undefined;
    if (isListening) {
      throw new DOMException("recognition has already started", "InvalidStateError");
    }

    this.finals = [];
    this.isSpeechHeard = false;
    this.isAudioStarted = false;
    const isDenied = this.backend.access() === PermissionStateName.DENIED;
    if (isDenied) {
      this.end(SpeechRecognitionErrorCode.NOT_ALLOWED);
      return;
    }

    this.dispatchEvent(new Event("start"));

    this.control = this.backend.start({
      options: {
        language: this.lang,
        isContinuous: this.continuous,
        isInterimEnabled: this.interimResults,
        maxAlternatives: Math.max(1, this.maxAlternatives),
        scenario: this.scenario,
        phrases: this.phrases
      },
      listener: this.listener()
    });
  }

  /** Stops listening and reports what was heard so far. */
  stop() {
    this.control?.stop();
  }

  /** Stops listening and drops what was heard so far. */
  abort() {
    this.control?.abort();
  }

  get [Symbol.toStringTag]() {
    return "SpeechRecognition";
  }

  private listener() {
    return {
      onAudioStart: () => {
        this.isAudioStarted = true;
        this.dispatchEvent(new Event("audiostart"));
      },
      onSpeechStart: () => {
        this.beginSpeech();
      },
      onInterim: transcript => {
        this.beginSpeech();
        this.report({
          transcript,
          isFinal: false
        });
      },
      onFinal: alternatives => {
        this.beginSpeech();
        const isEmpty = alternatives.length === 0;
        if (isEmpty) {
          this.dispatchEvent(
            new SpeechRecognitionEvent("nomatch", {
              resultIndex: this.finals.length,
              results: new SpeechRecognitionResultList(this.finals)
            })
          );
          return;
        }

        this.report({
          transcript: "",
          isFinal: true,
          alternatives
        });
      },
      onEnd: ending => {
        this.end(ending);
      }
    } satisfies RecognitionListener;
  }

  private beginSpeech() {
    if (this.isSpeechHeard) {
      return;
    }

    this.isSpeechHeard = true;
    this.dispatchEvent(new Event("soundstart"));
    this.dispatchEvent(new Event("speechstart"));
  }

  private report({
    transcript, isFinal, alternatives = [{
      transcript,
      confidence: 0
    }]
  }: {
    transcript: string;
    isFinal: boolean;
    alternatives?: readonly HeardAlternative[];
  }) {
    const isInterimHidden = !isFinal && !this.interimResults;
    if (isInterimHidden) {
      return;
    }

    const result = new SpeechRecognitionResult({
      alternatives: alternatives.slice(0, Math.max(1, this.maxAlternatives)),
      isFinal
    });
    const resultIndex = this.finals.length;
    if (isFinal) {
      this.finals.push(result);
    }

    const all = isFinal ? this.finals : [...this.finals, result];
    this.dispatchEvent(
      new SpeechRecognitionEvent("result", {
        resultIndex,
        results: new SpeechRecognitionResultList(all)
      })
    );
  }

  private end(ending: RecognitionEnding) {
    this.control = undefined;

    if (this.isSpeechHeard) {
      this.dispatchEvent(new Event("speechend"));
      this.dispatchEvent(new Event("soundend"));
    }

    if (this.isAudioStarted) {
      this.dispatchEvent(new Event("audioend"));
    }

    const isError = ending !== "completed";
    if (isError) {
      this.dispatchEvent(new SpeechRecognitionErrorEvent("error", { error: ending }));
    }

    this.dispatchEvent(new Event("end"));
  }
}

/** What `installSpeechRecognition` takes. */
export interface SpeechRecognitionInstallOptions {
  /** Stands in for Windows' `SpeechRecognizer`; the tests give one. */
  readonly backend?: SpeechRecognitionBackend;
}

/**
 * Defines `SpeechRecognition` and `webkitSpeechRecognition` over Windows'
 * `SpeechRecognizer`; the Permissions API's `microphone` is answered by
 * `installMediaDevices`. Nothing
 * is defined until this is called; call it on the thread the app's code runs
 * on.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes them away again.
 */
export function installSpeechRecognition(options: SpeechRecognitionInstallOptions = {}) {
  const backend = options.backend ?? windowsSpeechRecognitionBackend({
    access: () => windowsMediaAccess(MediaPermission.MICROPHONE)
  });
  class BoundSpeechRecognition extends SpeechRecognition {
    constructor() {
      super(backend);
    }
  }

  const uninstalls = [
    defineProperty({
      name: "SpeechRecognition",
      value: BoundSpeechRecognition
    }),
    defineProperty({
      name: "webkitSpeechRecognition",
      value: BoundSpeechRecognition
    }),
    defineProperty({
      name: "SpeechRecognitionEvent",
      value: SpeechRecognitionEvent
    }),
    defineProperty({
      name: "SpeechRecognitionErrorEvent",
      value: SpeechRecognitionErrorEvent
    }),
    defineProperty({
      name: "SpeechGrammarList",
      value: SpeechGrammarList
    }),
    defineProperty({
      name: "webkitSpeechGrammarList",
      value: SpeechGrammarList
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
