<script lang="ts">
  import type { CanvasProps } from "./canvas-props.ts";
  import { Recording } from "./painter.ts";
  import CanvasControl from "#src/components/generated/win2d/CanvasControl.svelte";
  import type { CanvasControl as CanvasControlNative } from "#winui/microsoft/graphics/canvas/ui/xaml/CanvasControl";

  // A CanvasControl you draw on with a function. `draw` runs inside an $effect,
  // so what it reads is tracked: when that changes, or the control is resized,
  // it runs again and the control is invalidated, and the Draw event replays
  // what it painted.
  const { draw, createResources, ondrawn, onsizechanged, ...rest }: CanvasProps = $props();
  let native = $state.raw<CanvasControlNative>();
  let size = $state.raw({
    width: 0,
    height: 0
  });
  const recording = new Recording();
  let drawCount = 0;

  $effect(() => {
    const control = native;
    if (!control) {
      return;
    }

    recording.reset();
    draw({
      painter: recording.painter,
      width: size.width,
      height: size.height,
      dpi: control.dpi,
      device: control.device
    });
    control.invalidate();
  });
</script>

<CanvasControl
  {...rest}
  oncreateresources={sender => {
    native = sender;
    size = {
      width: sender.actualWidth,
      height: sender.actualHeight
    };
    Promise.resolve(createResources?.({ device: sender.device })).then(() => sender.invalidate());
  }}
  ondraw={(sender, args) => {
    // Draw can fire inside another component's blocking WinRT call (a message
    // pump), where writing state is an error: the control is stored a tick later.
    queueMicrotask(() => {
      native = sender;
    });
    recording.replay(args.drawingSession);
    drawCount++;
    ondrawn?.(drawCount);
  }}
  onsizechanged={(...args) => {
    const control = native;
    if (control) {
      size = {
        width: control.actualWidth,
        height: control.actualHeight
      };
    }

    onsizechanged?.(...args);
  }}
/>
