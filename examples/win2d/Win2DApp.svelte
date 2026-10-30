<script lang="ts">
  import { drawBarChart } from "./bar-chart.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { NetworkInformation } from "#winui/windows/networking/connectivity/NetworkInformation";
  import { StackPanel, Window } from "winui-svelte/components";
  import {
    bitmapFromColors,
    Canvas,
    CanvasLinearGradientBrush,
    createTextFormat,
    GaussianBlurEffect
  } from "winui-svelte/win2d";
  import { Canvas2D } from "winui-svelte/win2d/context-2d";
  import { exitApplication, startTimer } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 480;
  const TILE_SIZE = 8;
  const TILE_SCALE = 8;
  const INITIAL_BLUR = 4;
  const SUN_HEIGHT_DIVISOR = 3;
  const MARGIN = 16;
  const PANEL_WIDTH = 240;
  const PANEL_HEIGHT = 330;
  const CHART_LABELS = ["Mon", "Tue", "Wed", "Thu"];
  const INITIAL_CHART = "3,7,4,9";
  const PUMP_CALLS = 30;
  const PUMP_BLUR = 9;
  const PUMP_DELAY = 100;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  let blurAmount = $state(INITIAL_BLUR);
  let chartValues = $state(INITIAL_CHART.split(",").map(Number));
  const status = {
    redraws: 0,
    runs: 0,
    chartRedraws: 0,
    chartRuns: 0,
    chartWidth: 0,
    chartHeight: 0
  };
  const label = createTextFormat({ size: 20 });
  const checker = Array.from({ length: TILE_SIZE * TILE_SIZE }, (_color, i) => {
    const isLight = (i + Math.floor(i / TILE_SIZE)) % 2 === 0;
    return isLight ? {
      a: 255,
      r: 255,
      g: 200,
      b: 0
    } : {
      a: 255,
      r: 20,
      g: 40,
      b: 120
    };
  });

  // A blocking WinRT call pumps the window's messages, so a pending Draw event
  // runs inside it; read from a $derived, that is where writing state is an error.
  let pumpTick = $state(0);

  function drawsDuringCalls() {
    const before = status.redraws + status.chartRedraws;
    for (let i = 0; i < PUMP_CALLS; i++) {
      NetworkInformation.getConnectionProfiles();
    }

    return status.redraws + status.chartRedraws - before;
  }

  const probe = $derived({
    tick: pumpTick,
    draws: drawsDuringCalls()
  });

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      blurAmount,
      ...status
    })],
    ["blur", command => {
      blurAmount = Number(command["amount"]);
    }],
    ["chart", command => {
      chartValues = String(command["values"]).split(",").map(Number);
    }],
    ["pump", () => {
      // Draws are pending once the state change has invalidated both canvases.
      blurAmount = PUMP_BLUR;
      chartValues = chartValues.toReversed();
      startTimer({
        milliseconds: PUMP_DELAY,
        isRepeating: false,
        onTick() {
          try {
            pumpTick++;
            host.report({
              kind: "pumped",
              drawsDuringPump: probe.draws
            });
          } catch (thrown) {
            host.report({
              kind: "pumped",
              drawsDuringPump: -1,
              error: String(thrown)
            });
          }
        }
      });
    }],
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
  title="Win2D example"
  width={WINDOW_WIDTH}
>
  <StackPanel orientation="Horizontal">
    <Canvas
      draw={({ painter, width, height, device }) => {
        status.runs++;
        const sky = new CanvasLinearGradientBrush(device, {
          a: 255,
          r: 10,
          g: 20,
          b: 60
        }, {
          a: 255,
          r: 120,
          g: 40,
          b: 160
        });
        painter.fillRectangle({
          x: 0,
          y: 0,
          width,
          height,
          paint: sky
        });
        painter.fillCircle({
          x: width / 2,
          y: height / SUN_HEIGHT_DIVISOR,
          radius: 48,
          paint: {
            a: 255,
            r: 255,
            g: 220,
            b: 120
          }
        });
        painter.drawText({
          text: `Win2D from Svelte, blur ${blurAmount}`,
          x: 16,
          y: 16,
          paint: {
            a: 255,
            r: 255,
            g: 255,
            b: 255
          },
          format: label
        });
        const blur = new GaussianBlurEffect();
        blur.source = bitmapFromColors({
          creator: device,
          colors: checker,
          width: TILE_SIZE,
          height: TILE_SIZE
        });
        blur.blurAmount = blurAmount;
        painter.transformed({
          matrix: {
            m11: TILE_SCALE,
            m12: 0,
            m21: 0,
            m22: TILE_SCALE,
            m31: MARGIN,
            m32: height - TILE_SIZE * TILE_SCALE - MARGIN
          },
          draw: scaled => scaled.drawImage({ image: blur })
        });
      }}
      height={PANEL_HEIGHT}
      onDrawn={count => {
        status.redraws = count;
      }}
      width={PANEL_WIDTH}
    />
    <Canvas2D
      draw={canvas => {
        status.chartRuns++;
        status.chartWidth = canvas.width;
        status.chartHeight = canvas.height;
        drawBarChart({
          canvas,
          labels: CHART_LABELS,
          values: chartValues
        });
      }}
      height={PANEL_HEIGHT}
      onDrawn={count => {
        status.chartRedraws = count;
      }}
      width={PANEL_WIDTH}
    />
  </StackPanel>
</Window>
