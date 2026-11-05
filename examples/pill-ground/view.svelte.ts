import { GlowMode, PillStatus } from "./pill-view.ts";
import type { PillAction, PillView } from "./pill-view.ts";

// The one state object. Written here with sample content so the layout shows
// every part; the real host replaces it with `hostState<PillView>({ channel,
// name: "view" })` (winui-svelte/state), which is read the same way.
export const view = $state<PillView>({
  status: PillStatus.listening,
  statusDetail: "",
  isMuted: false,
  lines: [
    {
      id: "1",
      text: "What is the tallest building in Tel Aviv",
      isUser: true,
      isNote: false
    },
    {
      id: "2",
      text: "The Azrieli Sarona Tower, at about 238 meters",
      isUser: false,
      isNote: false
    }
  ],
  links: [
    {
      id: "1",
      title: "Azrieli Sarona Tower",
      uri: "https://en.wikipedia.org/wiki/Azrieli_Sarona_Tower"
    }
  ],
  displays: [
    {
      id: "1",
      name: "Display 1"
    },
    {
      id: "2",
      name: "Display 2"
    }
  ],
  sharedDisplay: "1",
  isExtensionNeeded: false,
  isExtensionStepsShown: false,
  isKeyPromptShown: true,
  engine: "Google",
  microphones: [
    {
      id: "a",
      name: "Headset microphone"
    }
  ],
  microphoneId: null,
  isCameraShared: false,
  update: null,
  glow: {
    mode: GlowMode.breathe,
    level: 0,
    isUser: false
  },
  isShown: true,
  isFocusable: false
});

const sentActions: PillAction[] = [];

// The host's `channel.send(action)` in the real app
export function send(action: PillAction) {
  sentActions.push(action);
}
