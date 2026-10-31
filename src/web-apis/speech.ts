import { installSpeechRecognition } from "./speech-recognition.ts";
import { installSpeechSynthesis } from "./speech-synthesis.ts";

export type {
  HeardAlternative,
  RecognitionControl,
  RecognitionEnding,
  RecognitionListener,
  RecognitionOptions,
  SpeechRecognitionBackend,
  SpeechRecognitionExtras,
  SpeechRecognitionInstallOptions,
  SpeechRecognitionScenario
} from "./speech-recognition.ts";
export {
  installSpeechRecognition,
  SpeechGrammarList,
  SpeechRecognition,
  SpeechRecognitionAlternative,
  SpeechRecognitionErrorCode,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionResult,
  SpeechRecognitionResultList
} from "./speech-recognition.ts";
export type { RenderedBoundary, RenderedSpeech } from "./speech-synthesis-source.ts";
export { renderSpeech } from "./speech-synthesis-source.ts";
export type {
  SpeechBoundary,
  SpeechControl,
  SpeechListener,
  SpeechRequest,
  SpeechSilence,
  SpeechSynthesisBackend,
  SpeechSynthesisInstallOptions,
  SpeechSynthesisUtteranceExtras,
  SpeechSynthesisVoiceExtras,
  SpeechVoiceGender,
  SpeechVoiceInfo
} from "./speech-synthesis.ts";
export {
  installSpeechSynthesis,
  SpeechSynthesis,
  SpeechSynthesisErrorCode,
  SpeechSynthesisErrorEvent,
  SpeechSynthesisEvent,
  SpeechSynthesisUtterance,
  SpeechSynthesisVoice
} from "./speech-synthesis.ts";

/**
 * Installs both Speech APIs: `speechSynthesis` and `SpeechRecognition`.
 *
 * @returns The function that takes them away again.
 */
export function installSpeech() {
  const uninstalls = [installSpeechSynthesis(), installSpeechRecognition()];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
