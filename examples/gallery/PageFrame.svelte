<script lang="ts">
  import type { Snippet } from "svelte";
  import { ScrollViewer, StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    title: string;
    caption: string;
    children: Snippet;
  }

  const props: Props = $props();
</script>

<ScrollViewer>
  <StackPanel class="gallery-page">
    <TextBlock class="gallery-title">{props.title}</TextBlock>
    <TextBlock class="gallery-caption">{props.caption}</TextBlock>
    {@render props.children()}
  </StackPanel>
</ScrollViewer>

<style>
  .gallery-page {
    gap: 12px;
    padding: 24px;
  }

  .gallery-title {
    font-weight: 600;
    font-size: 28px;
  }

<<<<<<< HEAD
  :global(.gallery-caption) {
    opacity: 0.7;
=======
  .gallery-caption {
    opacity: 70%;
>>>>>>> conv/d
  }
</style>
