import { view } from "./view.svelte.ts";
import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
import { ExtendedStyle, hasExtendedStyles } from "#src/window/native.js";
import { flush } from "winui-svelte";
import type { WindowHandle } from "winui-svelte/components";
import { displayAreaOf, DockDisplay } from "winui-svelte/window";

// What a test says to the running example (test/pill-ground.test.ts): `content`
// sets how many transcript lines the card holds (none and no key prompt hides
// the card), `info` reads back what Windows holds for the window, `close`
// ends it. The real app has none of this; its host replaces `view`.

interface CommandContext {
  host: ExampleHost;
  handle(): WindowHandle | undefined;
  content: {
    readonly desiredHeight: number;
  };
}

function numberOf(value: ExampleCommand[string] | undefined) {
  return typeof value === "number" ? value : 0;
}

/**
 * The handler for the host's commands.
 *
 * @param context - The host to report to, the window and the measured content.
 * @returns A function for `host.onCommand`.
 */
export function commandsOf({ host, handle, content }: CommandContext) {
  function report(kind: string) {
    flush();
    const opened = handle();
    const isOpen = opened !== undefined;
    if (!isOpen) {
      host.report({
        kind,
        isOpen
      });
      return;
    }

    const { appWindow } = opened;
    const hwnd = appWindow.id.value;
    const { workArea } = displayAreaOf({
      appWindow,
      display: DockDisplay.current
    });
    host.report({
      kind,
      isOpen,
      scale: opened.scale,
      desiredHeight: content.desiredHeight,
      isNoActivate: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.noActivate
      }),
      isToolWindow: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.toolWindow
      }),
      hasBorder: opened.presenter?.hasBorder,
      workArea: {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
      },
      bounds: {
        x: appWindow.position.x,
        y: appWindow.position.y,
        width: appWindow.size.width,
        height: appWindow.size.height
      }
    });
  }

  const handlers = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => report("info")],
    ["content", command => {
      const lineCount = numberOf(command["lines"]);
      view.lines = Array.from({ length: lineCount }, (_, iLine) => ({
        id: String(iLine),
        text: `Line ${iLine}`,
        isUser: iLine % 2 === 0,
        isNote: false
      }));
      view.links = [];
      view.isKeyPromptShown = false;
      report("content");
    }],
    ["close", () => handle()?.close()]
  ]);
  return (command: ExampleCommand) => handlers.get(String(command["cmd"]))?.(command);
}
