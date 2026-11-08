<script lang="ts">
  import { scopedSource } from "./scoped-source.ts";
  import type { TaskbarProgressProps } from "./taskbar-progress-props.ts";
  import { bindTaskbarProgress } from "./taskbar-progress.ts";
  import { inheritedWindowHandle } from "#src/components/window-context.js";

  // Draws nothing: it keeps the taskbar button of its window (or of `window`)
  // in step with an operation, a group or every running operation.
  const props: TaskbarProgressProps = $props();
  const inherited = inheritedWindowHandle();

  $effect(() => {
    const target = props.taskbar ?? (props.window ?? inherited())?.taskbar;
    const isUnattached = target === undefined;
    if (isUnattached) {
      return;
    }

    const scoped = scopedSource({
      of: props.of,
      group: props.group
    });
    const stop = bindTaskbarProgress({
      source: scoped.source,
      taskbar: target
    });
    return () => {
      stop();
      scoped.dispose();
    };
  });
</script>
