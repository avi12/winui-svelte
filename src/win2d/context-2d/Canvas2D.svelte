<script lang="ts">
  import type { Canvas2DProps } from "./canvas-2d-props.ts";
  import { createCanvas2D } from "./canvas-element.ts";
  import { pointerHandlers } from "./pointer-events.ts";
  import CanvasControl from "#src/components/generated/win2d/CanvasControl.svelte";
  import { drawImage } from "#src/win2d/draw.js";
  import type { CanvasControl as CanvasControlNative } from "#winui/microsoft/graphics/canvas/ui/xaml/CanvasControl";

  // A CanvasControl that shows a canvas you draw on with the HTML Canvas 2D API.
  // The canvas keeps its pixels; each Draw event of the control paints them, and
  // anything drawn on the canvas invalidates the control.
  let {
    customDevice,
    canvas = $bindable(createCanvas2D({ device: customDevice ?? undefined })),
    draw,
    shouldFit = true,
    ondrawn,
    onsizechanged,
    onpointerpressed,
    onpointermoved,
    onpointerreleased,
    onpointerentered,
    onpointerexited,
    onpointercanceled,
    onpointerwheelchanged,
    ...rest
  }: Canvas2DProps = $props();
  let native = $state.raw<CanvasControlNative>();
  let size = $state.raw({
    width: 0,
    height: 0
  });
  let drawCount = 0;
  let isInvalidating = false;

  function measure() {
    const control = native;
    if (control) {
      size = {
        width: control.actualWidth,
        height: control.actualHeight
      };
    }
  }

  $effect(() => {
    const control = native;
    if (!control) {
      return;
    }

    if (shouldFit) {
      canvas.width = size.width;
      canvas.height = size.height;
    }

    draw?.(canvas);
  });

  $effect(() => canvas.watch(() => {
    if (isInvalidating) {
      return;
    }

    isInvalidating = true;
    queueMicrotask(() => {
      isInvalidating = false;
      native?.invalidate();
    });
  }));
</script>

<CanvasControl
  {...rest}
  customDevice={canvas.device}
  {...pointerHandlers({
    canvas,
    element: () => native,
    user: {
      onpointerpressed,
      onpointermoved,
      onpointerreleased,
      onpointerentered,
      onpointerexited,
      onpointercanceled,
      onpointerwheelchanged
    }
  })}
  oncreateresources={sender => {
    native = sender;
    measure();
  }}
  ondraw={(_sender, args) => {
    drawImage({
      session: args.drawingSession,
      image: canvas.target
    });
    drawCount++;
    ondrawn?.(drawCount);
  }}
  onsizechanged={(...args) => {
    measure();
    onsizechanged?.(...args);
  }}
/>
