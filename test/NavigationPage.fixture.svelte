<script lang="ts">
  // A page for the slots fixture's navigator: its label is what the test
  // reads back.
  import { TextBlock } from "#src/components/index.js";

  interface Props {
    label: string;
  }

  const props: Props = $props();
</script>

<TextBlock text={props.label} />
