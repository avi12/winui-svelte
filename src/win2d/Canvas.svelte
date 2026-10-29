<script lang="ts">
  import type { CanvasProps } from "./canvas-props.ts";
  import { Recording } from "./painter.ts";
  import CanvasControl from "#src/components/generated/win2d/CanvasControl.svelte";
  import type { CanvasControl as CanvasControlNative } from "#winui/microsoft/graphics/canvas/ui/xaml/CanvasControl";

  // A CanvasControl you draw on with a function. `draw` runs inside an $effect,
  // so what it reads is tracked: when that changes, or the control is resized,
  // it runs again and the control is invalidated, and the Draw event replays
  // what it painted.
  let { draw, createResources, onDrawn, onSizeChanged, ...rest }: CanvasProps = $props();
  let native = $state.raw<CanvasControlNative>();
  let size = $state.raw({
    width: 0,
    height: 0
  });
  const recording = new Recording();
  let drawCount = 0;

  $effect(() => {
    if (native === undefined) {
      return;
    }

    recording.reset();
    draw({
      painter: recording.painter,
      width: size.width,
      height: size.height,
      dpi: native.dpi,
      device: native.device
    });
    native.invalidate();
  });
</script>

<CanvasControl
  {...rest}
  onSizeChanged={(...args) => {
    if (native !== undefined) {
      size = {
        width: native.actualWidth,
        height: native.actualHeight
      };
    }

    onSizeChanged?.(...args);
  }}
  onCreateResources={sender => {
    native = sender;
    size = {
      width: sender.actualWidth,
      height: sender.actualHeight
    };
    Promise.resolve(createResources?.({ device: sender.device })).then(() => sender.invalidate());
  }}
  onDraw={(sender, args) => {
    native = sender;
    recording.replay(args.drawingSession);
    drawCount++;
    onDrawn?.(drawCount);
  }}
/>
