import { base, createRules } from "eslint-config-avi12/base";
import { svelte } from "eslint-config-avi12/svelte";

const NATIVE_BINDING_FILES = [
  "src/window/native.ts",
  "src/notice/native.ts",
  "src/tray/native.ts",
  "src/tray/standalone/native.ts",
  "src/devices/native.ts",
  "src/web-apis/native.ts",
  "src/app/native.ts",
  "src/app/activation/native.ts",
  "src/app/jump-list/native.ts",
  "src/app/shell/native.ts",
  "src/app/hotkeys/native.ts",
  "src/data-transfer/native.ts",
  "src/input/native.ts",
  "src/security/native.ts",
  "examples/hotkeys/native.ts",
  "src/win32-calls.ts",
  "src/win32-icons.ts",
  "src/tray/standalone/native.test.ts"
];
// The Canvas 2D API and the Web APIs under src/web-apis are positional
// (context.moveTo(x, y), usb.requestDevice(options)), so that a library written
// for a browser calls them unchanged (CLAUDE.md, "Which rules win").
const PLATFORM_API_FILES = [
  "src/win2d/context-2d/context.ts",
  "src/win2d/context-2d/path.ts",
  "src/win2d/context-2d/paint.ts",
  "src/win2d/context-2d/canvas-element.ts",
  "src/web-apis/*.ts"
];
const TEST_FILES = [
  "**/*.test.ts",
  "test/**",
  "**/*.fixture.svelte",
  "src/state/test-support/**",
  "src/devices/test-support/**",
  "src/barcode/test-support/**",
  "src/renderer/testing/**"
];
const ENTRY_FILES = ["src/cli/main.ts", "src/window/bootstrap.ts", "src/window/thread.ts"];
const WIN32_IMPORT_MESSAGE = "Flat Win32 calls are bound in the native.ts files (and src/win32-calls.ts) only.";

// Signatures that something outside this repository dictates: the web's and Chrome's positional
// parameters, Svelte's action and attachment shapes, PromiseLike, and a recursive function whose
// return type TypeScript cannot infer. Each file lists what it mirrors, so a new one is a decision.
const POSITIONAL_PARAMETER_FILES = [
  "examples/interaction/InteractionApp.svelte",
  "ide/vscode/src/convert-commands.ts",
  "scripts/codegen/binding-list.ts",
  "src/app/activation/protocol-handlers.ts",
  "src/app/notification-source.ts",
  "src/app/schedule/alarms.ts",
  "src/chrome/context-menus/chrome-context-menus.ts",
  "src/chrome/i18n/chrome-i18n.ts",
  "src/chrome/notifications/chrome-notifications.ts",
  "src/chrome/windows/chrome-windows.ts",
  "src/components/hand-written/visual-states/state-group-list.ts",
  "src/components/runtime.svelte.ts",
  "src/css/runtime/visual-states.ts",
  "src/css/validate/stylelint.ts",
  "src/data-transfer/data-transfer.ts",
  "src/input/projected-arguments.ts",
  "src/progress/progress-operation.ts",
  "src/renderer/host/connected-animation.test.ts",
  "src/renderer/host/element-animation.ts",
  "src/renderer/host/reflect.ts",
  "src/renderer/testing/Features.fixture.svelte",
  "src/renderer/testing/fake-controls.ts",
  "src/renderer/tree/dom.ts",
  "src/vite/externals.ts",
  "src/vite/server.ts",
  "src/vite/svelte-resolve.ts",
  "src/web-apis/view-transitions.test.ts",
  "src/window/match-media.ts",
  "src/window/promise-timers.ts",
  "src/window/scheduler.test.ts"
];
const RECURSIVE_RETURN_TYPE_FILES = [
  "examples/tray-menu/describe-flyout.ts",
  "scripts/codegen/winmd.ts",
  "src/tray/menu-svelte/collect.ts",
  "src/tray/menu-svelte/edit-profile.ts",
  "src/tray/menu-svelte/preview-lines.ts",
  "src/tray/menu/describe.ts",
  "src/tray/menu/expand.ts",
  "src/tray/menu/menu.test.ts",
  "src/tray/menu/resolve-lite.ts",
  "src/tray/standalone/standalone-tray.test.ts",
  "src/vite/entrypoints/lower-menu-markup.ts",
  "src/vite/entrypoints/lower-tray-svelte.ts",
  "src/web-apis/credentials-codec.ts",
  "src/web-apis/credentials.test.ts"
];
const PLATFORM_REFLECT_FILE = "src/web-apis/web-storage.ts";
const REFLECT_FILES = [
  "src/chrome/i18n/language-defaults.ts",
  "src/web-apis/install.ts",
  "src/web-apis/network.ts",
  "src/web-apis/page.ts",
  "src/web-apis/screen.ts",
  "src/web-apis/web-storage.ts"
];

const [severity, ...packageSyntax] = createRules({ isPackageSource: true })["no-restricted-syntax"];

const TEST_PATH_PATTERN = /\.test\.ts$|\.fixture\.svelte$|^test\/|\/test-support\/|^src\/renderer\/testing\//;

function isSourcePath(path) {
  return path.startsWith("src/") && path.endsWith(".ts") && !TEST_PATH_PATTERN.test(path);
}

const SVELTE_LAYER = svelte({ formatter: "eslint" });
const [, ...svelteSyntax] = SVELTE_LAYER.find(config => config.rules?.["no-restricted-syntax"]).rules["no-restricted-syntax"];

const [, ...otherSyntax] = createRules()["no-restricted-syntax"];

function withoutSyntax({ syntax, messageParts }) {
  return { "no-restricted-syntax": [severity, ...syntax.filter(({ message }) => !messageParts.some(part => message.includes(part)))] };
}

function exempt({ messageParts, files }) {
  return [
    {
      files: files.filter(path => path.endsWith(".svelte")),
      rules: withoutSyntax({
        syntax: svelteSyntax,
        messageParts
      })
    },
    {
      files: files.filter(isSourcePath),
      rules: withoutSyntax({
        syntax: packageSyntax,
        messageParts
      })
    },
    {
      files: files.filter(path => !path.endsWith(".svelte") && !isSourcePath(path)),
      rules: withoutSyntax({
        syntax: otherSyntax,
        messageParts
      })
    }
  ].filter(({ files: scope }) => scope.length > 0);
}

export default [
  ...base({
    formatter: "eslint",
    sourceFiles: ["src/**/*.ts", "src/**/*.svelte"],
    testFiles: TEST_FILES,
    ignores: [
      ".winapp/",
      "src/components/generated/",
      "src/components/fluent-glyph.ts",
      "ide/webstorm/",
      "ide/vscode/dist/"
    ]
  }),
  ...SVELTE_LAYER,
  {
    files: ["**/*.{ts,svelte}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@microsoft/dynwinrt/win32/unsafe",
            message: WIN32_IMPORT_MESSAGE
          },
          {
            name: "@microsoft/dynwinrt/win32",
            message: WIN32_IMPORT_MESSAGE
          }
        ]
      }]
    }
  },
  {
    files: NATIVE_BINDING_FILES,
    rules: {
      "no-restricted-imports": "off"
    }
  },
  {
    files: PLATFORM_API_FILES,
    ignores: TEST_FILES,
    rules: {
      ...withoutSyntax({
        syntax: packageSyntax,
        messageParts: ["2+ parameters"]
      })
    }
  },
  {
    files: ENTRY_FILES,
    rules: {
      "no-restricted-syntax": createRules()["no-restricted-syntax"]
    }
  },
  ...exempt({
    messageParts: ["2+ parameters"],
    files: POSITIONAL_PARAMETER_FILES
  }),
  ...exempt({
    messageParts: ["return type"],
    files: RECURSIVE_RETURN_TYPE_FILES
  }),
  ...exempt({
    messageParts: ["Reflect"],
    files: REFLECT_FILES.filter(path => path !== PLATFORM_REFLECT_FILE)
  }),
  ...exempt({
    messageParts: ["Reflect", "2+ parameters"],
    files: [PLATFORM_REFLECT_FILE]
  }),
  {
    files: ["src/**/*.svelte.ts", "test/**/*.svelte.ts"],
    rules: {
      "svelte/prefer-svelte-reactivity": "off"
    }
  },
  {
    files: ["src/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      "jsdoc/check-tag-names": ["error", {
        typed: true,
        definedTags: ["taskbarTheme"]
      }]
    }
  },
  {
    files: ["ide/vscode/src/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  }
];
