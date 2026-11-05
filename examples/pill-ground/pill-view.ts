// The state the pill draws, as the C# host would send it (HANDOFF-gemini-live.md,
// "One host state named view"): one plain object, replaced field by field by
// `patch` lines. The window holds no other state of its own.

export const GlowMode = {
  rest: "rest",
  breathe: "breathe",
  level: "level"
} as const;
export type GlowMode = typeof GlowMode[keyof typeof GlowMode];

export const PillStatus = {
  connecting: "Connecting",
  listening: "Listening",
  muted: "Muted",
  failed: "Could not connect"
} as const;

export interface PillLine {
  readonly id: string;
  readonly text: string;
  readonly isUser: boolean;
  readonly isNote: boolean;
}

export interface PillLink {
  readonly id: string;
  readonly title: string;
  readonly uri: string;
}

export interface PillDisplay {
  readonly id: string;
  readonly name: string;
}

export interface PillMicrophone {
  readonly id: string;
  readonly name: string;
}

export interface PillUpdate {
  readonly text: string;
  readonly isAvailable: boolean;
}

export interface PillGlow {
  readonly mode: GlowMode;
  readonly level: number;
  readonly isUser: boolean;
}

export interface PillView {
  status: string;
  statusDetail: string;
  isMuted: boolean;
  lines: PillLine[];
  links: PillLink[];
  displays: PillDisplay[];
  sharedDisplay: string | null;
  isExtensionNeeded: boolean;
  isExtensionStepsShown: boolean;
  isKeyPromptShown: boolean;
  engine: string;
  microphones: PillMicrophone[];
  microphoneId: string | null;
  isCameraShared: boolean;
  update: PillUpdate | null;
  glow: PillGlow;
  isShown: boolean;
  // Not in the handoff's sketch: the window is focusable while text is
  // selected or the key prompt is open (the `setFocusable` action's answer)
  isFocusable: boolean;
}

// The actions back to C# (HANDOFF-gemini-live.md, "Actions back to C#")
export type PillAction =
  | { readonly kind: "mute" }
  | { readonly kind: "end" }
  | {
    readonly kind: "share";
    readonly displayId: string;
  }
  | {
    readonly kind: "setMicrophone";
    readonly microphoneId: string | null;
  }
  | {
    readonly kind: "setCamera";
    readonly isOn: boolean;
  }
  | {
    readonly kind: "setEngine";
    readonly engine: string;
  }
  | { readonly kind: "askForKey" }
  | {
    readonly kind: "submitKey";
    readonly key: string;
  }
  | { readonly kind: "cancelKey" }
  | { readonly kind: "connectExtension" }
  | {
    readonly kind: "openLink";
    readonly uri: string;
  }
  | { readonly kind: "update" }
  | { readonly kind: "quit" }
  | {
    readonly kind: "setFocusable";
    readonly isFocusable: boolean;
  };

export const API_KEY_PAGE = "https://aistudio.google.com/apikey";

export const PillSize = {
  height: 48,
  glowRoom: 24
} as const;

export const PillColumn = {
  share: 1,
  microphone: 2,
  status: 3,
  gear: 4,
  end: 5
} as const;
