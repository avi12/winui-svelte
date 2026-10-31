import type {
  HeardAlternative,
  RecognitionControl,
  RecognitionEnding,
  RecognitionListener,
  RecognitionOptions,
  SpeechRecognitionBackend,
  SpeechRecognitionScenario
} from "./speech-recognition.ts";
import { Language } from "#winui/windows/globalization/Language";
import {
  SpeechRecognitionListConstraint
} from "#winui/windows/media/speech-recognition/SpeechRecognitionListConstraint";
import type { SpeechRecognitionResult } from "#winui/windows/media/speech-recognition/SpeechRecognitionResult";
import { SpeechRecognitionResultStatus } from "#winui/windows/media/speech-recognition/SpeechRecognitionResultStatus";
import {
  SpeechRecognitionScenario as WinRtScenario
} from "#winui/windows/media/speech-recognition/SpeechRecognitionScenario";
import {
  SpeechRecognitionTopicConstraint
} from "#winui/windows/media/speech-recognition/SpeechRecognitionTopicConstraint";
import { SpeechRecognizer } from "#winui/windows/media/speech-recognition/SpeechRecognizer";

const PRIVACY_DECLINED_PATTERN = /80045509/iu;
const ACCESS_DENIED_PATTERN = /80070005|access is denied/iu;

const scenarios = {
  dictation: WinRtScenario.Dictation,
  "web-search": WinRtScenario.WebSearch,
  "form-filling": WinRtScenario.FormFilling
} satisfies Record<SpeechRecognitionScenario, number>;

const endings = new Map<number, RecognitionEnding>([
  [SpeechRecognitionResultStatus.Success, "completed"],
  [SpeechRecognitionResultStatus.UserCanceled, "aborted"],
  [SpeechRecognitionResultStatus.MicrophoneUnavailable, "audio-capture"],
  [SpeechRecognitionResultStatus.NetworkFailure, "network"],
  [SpeechRecognitionResultStatus.TopicLanguageNotSupported, "language-not-supported"],
  [SpeechRecognitionResultStatus.GrammarLanguageMismatch, "bad-grammar"],
  [SpeechRecognitionResultStatus.GrammarCompilationFailure, "bad-grammar"],
  [SpeechRecognitionResultStatus.AudioQualityFailure, "no-speech"],
  [SpeechRecognitionResultStatus.TimeoutExceeded, "no-speech"],
  [SpeechRecognitionResultStatus.PauseLimitExceeded, "no-speech"]
]);

function endingOf(status: number) {
  return endings.get(status) ?? "audio-capture";
}

function endingOfError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (PRIVACY_DECLINED_PATTERN.test(message)) {
    return "service-not-allowed" as const;
  }

  const isDenied = ACCESS_DENIED_PATTERN.test(message);
  return isDenied ? "not-allowed" as const : "audio-capture" as const;
}

function alternativesOf({ result, maxAlternatives }: {
  result: SpeechRecognitionResult;
  maxAlternatives: number;
}) {
  const heard: HeardAlternative[] = [{
    transcript: result.text,
    confidence: result.rawConfidence
  }];
  const others = [...(result.getAlternates(maxAlternatives) ?? [])].slice(1);
  for (const other of others) {
    heard.push({
      transcript: other.text,
      confidence: other.rawConfidence
    });
  }

  return heard.slice(0, maxAlternatives);
}

function supports(language: string) {
  const wanted = language.toLowerCase();
  const supported = [...(SpeechRecognizer.supportedTopicLanguages ?? [])];
  return supported.some(candidate => candidate.languageTag.toLowerCase() === wanted);
}

async function listen({ options, listener, running }: {
  options: RecognitionOptions;
  listener: RecognitionListener;
  running: {
    recognizer: SpeechRecognizer | undefined;
    isAborted: boolean;
  };
}) {
  const hasLanguage = options.language !== "";
  const isUnsupported = hasLanguage && !supports(options.language);
  if (isUnsupported) {
    listener.onEnd("language-not-supported");
    return;
  }

  const recognizer = hasLanguage ? new SpeechRecognizer(new Language(options.language)) : new SpeechRecognizer();
  running.recognizer = recognizer;
  const hasPhrases = options.phrases.length > 0;
  recognizer.constraints?.append(
    hasPhrases
      ? new SpeechRecognitionListConstraint([...options.phrases])
      : new SpeechRecognitionTopicConstraint(scenarios[options.scenario], options.scenario)
  );
  const compiled = await recognizer.compileConstraintsAsync();
  const isCompiled = compiled.status === SpeechRecognitionResultStatus.Success;
  if (!isCompiled) {
    listener.onEnd(endingOf(compiled.status));
    return;
  }

  if (options.isInterimEnabled) {
    recognizer.onHypothesisGenerated((_sender, args) => {
      listener.onInterim(args.hypothesis.text);
    });
  }

  listener.onAudioStart();

  if (options.isContinuous) {
    await listenContinuously({
      recognizer,
      options,
      listener
    });
    return;
  }

  const result = await recognizer.recognizeAsync();
  const isSuccess = result.status === SpeechRecognitionResultStatus.Success;
  const hasText = result.text !== "";
  if (isSuccess) {
    listener.onFinal(
      hasText ? alternativesOf({
        result,
        maxAlternatives: options.maxAlternatives
      }) : []
    );
  }

  listener.onEnd(running.isAborted ? "aborted" : endingOf(result.status));
}

async function listenContinuously({ recognizer, options, listener }: {
  recognizer: SpeechRecognizer;
  options: RecognitionOptions;
  listener: RecognitionListener;
}) {
  const session = recognizer.continuousRecognitionSession;
  session.onResultGenerated((_sender, args) => {
    const { result } = args;
    const hasText = result.text !== "";
    if (hasText) {
      listener.onFinal(
        alternativesOf({
          result,
          maxAlternatives: options.maxAlternatives
        })
      );
    }
  });
  session.onCompleted((_sender, args) => {
    listener.onEnd(endingOf(args.status));
  });
  await session.startAsync();
}

/**
 * The backend over Windows' `SpeechRecognizer`: one phrase with
 * `recognizeAsync`, or a `ContinuousRecognitionSession` when `continuous` is
 * on. Dictation online needs the "online speech recognition" privacy switch;
 * with it off the recognition ends with `service-not-allowed`. The recognizer
 * raises its events on a thread of its own; where the bindings do not deliver
 * one, only the single-phrase mode is complete.
 *
 * @param options - How to read the microphone permission.
 * @returns The backend.
 */
export function windowsSpeechRecognitionBackend({ access }: {
  access: SpeechRecognitionBackend["access"];
}) {
  const backend = {
    access,
    start({ options, listener }) {
      const running: {
        recognizer: SpeechRecognizer | undefined;
        isAborted: boolean;
      } = {
        recognizer: undefined,
        isAborted: false
      };
      listen({
        options,
        listener,
        running
      }).catch((error: unknown) => {
        listener.onEnd(endingOfError(error));
      });
      function end() {
        const { recognizer } = running;
        const promise = options.isContinuous
          ? recognizer?.continuousRecognitionSession.stopAsync()
          : recognizer?.stopRecognitionAsync();
        promise?.catch(() => undefined);
      }

      return {
        stop() {
          end();
        },
        abort() {
          running.isAborted = true;
          end();
        }
      } satisfies RecognitionControl;
    }
  } satisfies SpeechRecognitionBackend;
  return backend;
}
