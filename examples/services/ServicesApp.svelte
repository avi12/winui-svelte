<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#src/winui.js";
  import type { Border as BorderControl } from "#winui/microsoft/ui/xaml/controls/Border";
  import type { Button as ButtonControl } from "#winui/microsoft/ui/xaml/controls/Button";
  import { SolidColorBrush } from "#winui/microsoft/ui/xaml/media/SolidColorBrush";
  import {
    control,
    elementRef,
    elementSize,
    elementTheme,
    flush,
    focusElement,
    FocusKind
  } from "winui-svelte";
  import {
    Border,
    Button,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { exitApplication, PickerLocation, systemSettings } from "winui-svelte/window";

  const WINDOW_HEIGHT = 420;
  const WINDOW_WIDTH = 520;
  const SWATCH_SIZE = 48;
  const NARROW_WIDTH = 260;
  const PERCENT = 100;
  const TEXT_FILES = [".txt", ".md"];
  // Fixed ARGB bytes to the #rrggbb text the settings reader gives.
  const HEX_RADIX = 16;
  const HEX_DIGITS_PER_CHANNEL = 2;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // Created on the UI thread, in the component script: the accent color, the
  // text scale and the animation setting follow the user's Windows settings.
  const settings = systemSettings();
  // The size and theme of the page, for a layout that adapts to them.
  const size = elementSize();
  const theme = elementTheme();
  const pickButton = elementRef<ButtonControl>();

  let handle: WindowHandle | undefined = $state();
  let swatch: BorderControl | undefined;
  let picked = $state("Nothing picked yet");

  // The language the system asks for: Intl reads it with no package identity.
  // Windows' ResourceLoader would need a resources.pri next to node.exe.
  const LANGUAGE = new Intl.DateTimeFormat().resolvedOptions().locale;

  function sizeText() {
    const isNarrow = size.width > 0 && size.width < NARROW_WIDTH;
    if (isNarrow) {
      return `${size.width} by ${size.height} (narrow)`;
    }

    return `${size.width} by ${size.height}`;
  }

  function animationText() {
    if (settings.isAnimationEnabled) {
      return "on";
    }

    return "off";
  }

  function hexOf(channel: number) {
    return channel.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_CHANNEL, "0");
  }

  // The color the swatch's brush holds, read back from WinUI.
  function swatchColor() {
    const brush = swatch?.background;
    const hasBrush = brush !== undefined && brush !== null;
    if (!hasBrush) {
      return undefined;
    }

    const { r, g, b } = projectAs(brush, SolidColorBrush).color;
    return `#${hexOf(r)}${hexOf(g)}${hexOf(b)}`;
  }

  async function pickFile() {
    const path = await handle?.pickFile({
      title: "Open a note",
      startIn: PickerLocation.documents,
      fileTypes: TEXT_FILES
    });
    picked = path ?? "Cancelled";
    const button = pickButton.current;
    if (button) {
      focusElement({
        control: button,
        state: FocusKind.keyboard
      });
    }
  }

  async function pickFolder() {
    const path = await handle?.pickFolder({ title: "Choose a folder" });
    picked = path ?? "Cancelled";
  }

  async function saveFile() {
    const path = await handle?.saveFile({
      suggestedFileName: "note",
      defaultFileExtension: ".txt",
      fileTypeChoices: {
        text: [".txt"],
        markdown: [".md"]
      }
    });
    picked = path ?? "Cancelled";
  }

  function report(kind: string) {
    flush();
    host.report({
      kind,
      accent: settings.accentColor,
      swatch: swatchColor(),
      textScaleFactor: settings.textScaleFactor,
      isAnimationEnabled: settings.isAnimationEnabled,
      width: size.width,
      height: size.height,
      theme: theme.current,
      language: LANGUAGE,
      canPick: [handle?.pickFile, handle?.pickFiles, handle?.pickFolder, handle?.saveFile].every(
        method => typeof method === "function"
      )
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="App services example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <StackPanel {@attach size.attach} {@attach theme.attach}>
    <Border
      {@attach control<BorderControl>(native => {
        swatch = native;
      })}
      background={settings.accentColor}
      height={SWATCH_SIZE}
      width={SWATCH_SIZE}
    />
    <TextBlock>Accent {settings.accentColor}, text {settings.textScaleFactor * PERCENT}%</TextBlock>
    <TextBlock>Animations {animationText()}, language {LANGUAGE}</TextBlock>
    <TextBlock>This page is {sizeText()}</TextBlock>
    <Button {@attach pickButton.attach} onClick={pickFile}>Open a note</Button>
    <Button onClick={pickFolder}>Choose a folder</Button>
    <Button onClick={saveFile}>Save as</Button>
    <TextBlock>{picked}</TextBlock>
  </StackPanel>
</Window>
