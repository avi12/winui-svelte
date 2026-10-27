<script lang="ts">
  // A component shaped as the generated ones are, for element-ref.test.ts:
  // its rest props go to its control, and the attachments written on it are
  // spread onto its element.
  import { attachmentsOf, control } from "#src/renderer/host/control.js";
  import type { NodeAttachment } from "#src/renderer/host/control.js";
  import type { Snippet } from "svelte";

  interface Props {
    children?: Snippet;
    [attachment: symbol]: NodeAttachment;
  }

  const { children, ...rest }: Props = $props();
</script>

<fake-text-block {...attachmentsOf(rest)} {@attach control(() => {})}>{@render children?.()}</fake-text-block>
