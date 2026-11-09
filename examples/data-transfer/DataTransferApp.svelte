<script lang="ts">
  import { dragPathOver } from "./ole-drag.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { dataTransferManagerOf } from "#src/data-transfer/share-interop.js";
  import type { Border as BorderControl } from "#winui/microsoft/ui/xaml/controls/Border";
  import type { TextBlock as TextBlockControl } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { control, flush } from "winui-svelte";
  import type { WindowHandle } from "winui-svelte/components";
  import { Border, StackPanel, TextBlock, Window } from "winui-svelte/components";
  import type { DragEvent } from "winui-svelte/data-transfer";
  import {
    DataTransfer,
    draggable,
    DropEffect,
    dropzone,
    enableDragEvents,
    nativeFileAt,
    simulateDrop
  } from "winui-svelte/data-transfer";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 480;
  const NO_WINDOW = BigInt(0);

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();

  enableDragEvents();

  let handle = $state<WindowHandle>();
  let zone: BorderControl | undefined;
  let rawZone: BorderControl | undefined;
  let source: TextBlockControl | undefined;
  let isOver = $state(false);
  let received = $state("Nothing dropped yet");
  const log: string[] = [];

  async function describe(event: DragEvent) {
    const { dataTransfer } = event;
    const bodies = await Promise.all(dataTransfer.files.map(file => file.kind === "file" ? file.text() : ""));
    return {
      types: dataTransfer.types,
      text: dataTransfer.getData("text/plain"),
      html: dataTransfer.getData("text/html"),
      files: dataTransfer.files.map((file, i) => `${file.name}:${file.kind}:${bodies[i]}`)
    };
  }

  async function drop({ target, paths, text, html }: {
    target: BorderControl | undefined;
    paths: string[];
    text: string;
    html: string;
  }) {
    const transfer = new DataTransfer();
    const hasText = text !== "";
    if (hasText) {
      transfer.setData("text/plain", text);
    }

    const hasHtml = html !== "";
    if (hasHtml) {
      transfer.setData("text/html", html);
    }

    for (const path of paths) {
      transfer.addFile(nativeFileAt(path));
    }

    if (!target) {
      return 0;
    }

    return simulateDrop({
      control: target,
      transfer
    });
  }

  async function onDrop(event: DragEvent) {
    const details = await describe(event);
    received = JSON.stringify(details);
    log.push(JSON.stringify(details));
  }

  function reportState() {
    flush();
    host.report({
      kind: "state",
      zoneAllowsDrop: zone?.allowDrop,
      rawAllowsDrop: rawZone?.allowDrop,
      sourceCanDrag: source?.canDrag,
      isOver,
      log
    });
  }

  const OLE_SETTLE_MILLISECONDS = 800;
  const OLE_INSET = 4;
  const OUTSIDE_DIPS = 250;

  function oleDrag(command: ExampleCommand) {
    const hwnd = handle?.appWindow.id.value ?? NO_WINDOW;
    const scale = zone?.xamlRoot?.rasterizationScale ?? 1;
    const zoneHeight = zone?.actualHeight ?? 0;
    const rawHeight = rawZone?.actualHeight ?? 0;
    const rows = new Map([
      ["zone", OLE_INSET],
      ["raw", zoneHeight + OLE_INSET],
      ["text", zoneHeight + rawHeight + OLE_INSET],
      ["outside", OUTSIDE_DIPS]
    ]);
    function point(name: string) {
      return {
        x: OLE_INSET * scale,
        y: (rows.get(name) ?? OUTSIDE_DIPS) * scale
      };
    }

    const result = dragPathOver({
      hwnd,
      path: String(command["path"] ?? ""),
      enterAt: point(String(command["enterAt"] ?? "outside")),
      overAt: point(String(command["overAt"] ?? "outside")),
      shouldDrop: command["shouldDrop"] === true
    });
    setTimeout(() => {
      flush();
      host.report({
        kind: "oleDragged",
        ...result,
        isOver,
        log
      });
    }, OLE_SETTLE_MILLISECONDS);
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["state", reportState],
    ["drop", command => {
      const target = command["target"] === "raw" ? rawZone : zone;
      drop({
        target,
        paths: Array.isArray(command["paths"]) ? command["paths"].map(String) : [],
        text: String(command["text"] ?? ""),
        html: String(command["html"] ?? "")
      }).then(accepted => {
        flush();
        host.report({
          kind: "dropped",
          accepted,
          log
        });
      }, (error: unknown) => host.report({
        kind: "failed",
        message: String(error)
      }));
    }],
    ["oleDrag", oleDrag],
    ["shareManager", () => {
      // GetForWindow only: ShowShareUIForWindow would open the real pane.
      try {
        const hwnd = handle?.appWindow.id.value ?? NO_WINDOW;
        const manager = dataTransferManagerOf(hwnd);
        const stop = manager.onDataRequested(() => undefined);
        stop();
        host.report({
          kind: "shareManager",
          isManager: typeof manager.onDataRequested === "function"
        });
      } catch (error) {
        host.report({
          kind: "shareManager",
          error: String(error)
        });
      }
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Data transfer example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <StackPanel>
    <Border
      {@attach control<BorderControl>(native => {
        zone = native;
      })}
      {@attach dropzone({
        accept: [".txt", "text/plain", "directory"],
        onDragStateChange: isEntering => (isOver = isEntering),
        onDrop
      })}
    >
      <TextBlock>Drop text files here</TextBlock>
    </Border>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <border
      {@attach control<BorderControl>(native => {
        rawZone = native;
      })}
      ondragover={(event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = DropEffect.link;
      }}
      ondrop={onDrop}
    >
      <text-block>A raw element</text-block>
    </border>
    <Border {@attach dropzone({ accept: ["text"] })}
    >
      <TextBlock>Text only</TextBlock>
    </Border>
    <TextBlock
      {@attach control<TextBlockControl>(native => {
        source = native;
      })}
      {@attach draggable({ text: "dragged" })}
    >
      Drag me
    </TextBlock>
    <TextBlock>{received}</TextBlock>
  </StackPanel>
</Window>
