<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { Json } from "#src/messaging/json.js";
  import {
    AppWindowPresenterKind,
    DesktopAcrylicBackdrop,
    ElementTheme,
    FrameworkElement,
    Grid,
    ICompositionSupportsSystemBackdrop,
    InputNonClientPointerSource,
    MicaBackdrop,
    MicaKind,
    NonClientRegionKind,
    projectAs,
    SystemCompositionColorBrush,
    TitleBarHeightOption
  } from "#src/winui.js";
  import { flush } from "winui-svelte";
  import { isColorText, Window } from "winui-svelte/components";
  import type { CaptionButtonColors, WindowBounds, WindowHandle, WindowRegion } from "winui-svelte/components";
  import { createWindow, exitApplication } from "winui-svelte/window";
  import { Backdrop, TitleBarHeight, WindowPresentation, WindowTheme } from "winui-svelte/window";

  const WINDOW_WIDTH = 520;
  const WINDOW_HEIGHT = 360;
  const WINDOW_MIN_WIDTH = 400;

  // The material named, or acrylic.
  function backdropOf(name: Json | undefined) {
    return Object.values(Backdrop).find(candidate => candidate === name) ?? Backdrop.acrylic;
  }

  // The name of the member of a WinUI enum that holds `value`.
  function nameOf({ table, value }: {
    table: Record<string, number>;
    value: number;
  }) {
    return Object.entries(table).find(([, member]) => member === value)?.[0];
  }

  // The host is the harness's, handed over once: it never changes.
  const { host }: { host: ExampleHost } = $props();

  // svelte-ignore state_referenced_locally
  let backdrop = $state(backdropOf(host.options["backdrop"]));
  let title = $state("Window example");
  let presentation = $state<WindowPresentation | undefined>();
  let theme = $state<WindowTheme | undefined>();
  let titleBarHeight = $state<TitleBarHeight | undefined>();
  let captionButtons = $state<CaptionButtonColors | undefined>();
  let dragRegions = $state<readonly WindowRegion[] | undefined>();
  let width = $state(WINDOW_WIDTH);
  let handle: WindowHandle | undefined = $state();
  let lastBounds: WindowBounds | null = null;
  let boundsReports = 0;
  let activations = 0;
  let closes = 0;
  let closeRequests = 0;
  let scaleChanges = 0;
  let isCloseBlocked = false;

  // The kind of material the window holds now, read back from WinUI.
  function backdropName() {
    const held = handle?.window.systemBackdrop;
    const isUnset = held === undefined || held === null;
    if (isUnset) {
      return "none";
    }

    // WinUI hands back the base class; projecting to the wrong one throws.
    try {
      return projectAs(held, MicaBackdrop).kind === MicaKind.BaseAlt ? "micaAlt" : "mica";
    } catch {
      return projectAs(held, DesktopAcrylicBackdrop) instanceof DesktopAcrylicBackdrop ? "acrylic" : "unknown";
    }
  }

  // The alpha of the window's composition backdrop when that is a color brush
  // (the transparent backdrop); null for any other material.
  function backdropBrushAlpha() {
    const brush = handle?.window.as(ICompositionSupportsSystemBackdrop).systemBackdrop;
    const isUnset = brush === undefined || brush === null;
    if (isUnset) {
      return null;
    }

    try {
      return projectAs(brush, SystemCompositionColorBrush).color.a;
    } catch {
      return null;
    }
  }

  // What WinUI holds for the window's chrome, read back from the native objects.
  function chromeReadback() {
    const appWindow = handle?.appWindow;
    const content = handle?.window.content;
    const isOpen = appWindow !== undefined && content !== undefined;
    if (!isOpen) {
      return {};
    }

    const { titleBar } = appWindow;
    return {
      presentation: nameOf({
        table: AppWindowPresenterKind,
        value: appWindow.presenter.kind
      }),
      theme: nameOf({
        table: ElementTheme,
        value: projectAs(content, FrameworkElement).requestedTheme
      }),
      titleBarHeightOption: nameOf({
        table: TitleBarHeightOption,
        value: titleBar.preferredHeightOption
      }),
      captionForeground: titleBar.buttonForegroundColor,
      captionHoverBackground: titleBar.buttonHoverBackgroundColor,
      dragRegions: InputNonClientPointerSource.getForWindowId(appWindow.id).getRegionRects(NonClientRegionKind.Caption)
    };
  }

  // The windowed presentation's presenter; undefined while the window is in another.
  function overlappedPresenter() {
    const isWindowed = handle?.appWindow.presenter.kind === AppWindowPresenterKind.Overlapped;
    if (!isWindowed) {
      return undefined;
    }

    return handle?.presenter;
  }

  // Reports what the window shows after the props the command changed have
  // reached it.
  function report(kind: string) {
    flush();
    const appWindow = handle?.window.appWindow;
    host.report({
      kind,
      backdrop: backdropName(),
      backdropBrushAlpha: backdropBrushAlpha(),
      ...chromeReadback(),
      title: handle?.window.title,
      scale: handle?.scale,
      extendsIntoTitleBar: handle?.window.extendsContentIntoTitleBar,
      width: appWindow?.size.width,
      height: appWindow?.size.height,
      x: appWindow?.position.x,
      y: appWindow?.position.y,
      minimumWidth: overlappedPresenter()?.preferredMinimumWidth,
      isMaximizable: overlappedPresenter()?.isMaximizable,
      boundsReports,
      lastBounds,
      activations,
      closeRequests,
      scaleChanges,
      closes
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => report("info")],
    ["backdrop", command => {
      backdrop = backdropOf(command["value"]);
      report("backdrop");
    }],
    ["title", command => {
      title = String(command["value"]);
      report("title");
    }],
    ["presentation", command => {
      presentation = Object.values(WindowPresentation).find(candidate => candidate === command["value"]);
      report("presentation");
    }],
    ["theme", command => {
      theme = Object.values(WindowTheme).find(candidate => candidate === command["value"]);
      report("theme");
    }],
    ["titleBarHeight", command => {
      titleBarHeight = Object.values(TitleBarHeight).find(candidate => candidate === command["value"]);
      report("titleBarHeight");
    }],
    ["captionButtons", command => {
      const foreground = String(command["foreground"]);
      const hoverBackground = String(command["hoverBackground"]);
      const isSet = command["value"] !== null && isColorText(foreground) && isColorText(hoverBackground);
      captionButtons = isSet ? {
        foreground,
        hoverBackground
      } : undefined;
      report("captionButtons");
    }],
    ["dragRegions", command => {
      dragRegions = command["value"] === null ? undefined : [
        {
          x: Number(command["x"]),
          y: 0,
          width: Number(command["width"]),
          height: Number(command["height"])
        }
      ];
      report("dragRegions");
    }],
    ["width", command => {
      width = Number(command["value"]);
      report("width");
    }],
    ["move", command => {
      handle?.appWindow.move({
        x: Number(command["x"]),
        y: Number(command["y"])
      });
      report("moved");
    }],
    ["blockClose", command => {
      isCloseBlocked = command["value"] === true;
      report("blockClose");
    }],
    ["openOwned", () => {
      const owner = handle;
      const isOpen = owner !== undefined;
      if (!isOpen) {
        return;
      }

      const owned = createWindow({
        control: new Grid(),
        owner,
        isModal: true,
        isBackground: true
      });
      const ownedHandle = owned.window.appWindow;
      host.report({
        kind: "owned",
        ownerId: String(ownedHandle.ownerWindowId.value),
        expectedOwnerId: String(owner.appWindow.id.value)
      });
      owned.close();
    }],
    ["tryClose", () => {
      handle?.close();
      report("closeTried");
    }],
    ["close", () => handle?.close()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  appUserModelId="winui-svelte.examples.window"
  {backdrop}
  {captionButtons}
  {dragRegions}
  height={WINDOW_HEIGHT}
  isMaximizable={false}
  minWidth={WINDOW_MIN_WIDTH}
  onactivechanged={isActive => {
    if (isActive) {
      activations++;
    }
  }}
  onboundschanged={bounds => {
    boundsReports++;
    lastBounds = bounds;
  }}
  onclosed={() => {
    closes++;
    exitApplication();
  }}
  onclosing={() => {
    closeRequests++;
    return isCloseBlocked;
  }}
  onscalechanged={() => {
    scaleChanges++;
  }}
  {presentation}
  {theme}
  {title}
  {titleBarHeight}
  {width}
  bind:handle
>
  {#snippet titleBar()}
    <stack-panel class="title-bar">
      <text-block class="title">{title}</text-block>
    </stack-panel>
  {/snippet}
  <stack-panel class="content">
    <text-block class="heading">Backdrop: {backdrop}</text-block>
    <text-block>The content runs into the title bar; the backdrop shows through.</text-block>
  </stack-panel>
</Window>

<style>
  .title-bar {
    flex-direction: row;
    gap: 10px;
    height: 40px;
    padding-left: 14px;
  }

  .title {
    align-self: center;
  }

  .content {
    gap: 8px;
    padding: 24px;
  }

  .heading {
    font-size: 20px;
  }
</style>
