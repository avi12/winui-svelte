<script lang="ts">
  import type { Snippet } from "svelte";
  import { ScrollViewer, StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    title: string;
    caption: string;
    children: Snippet;
  }

  const { title, caption, children }: Props = $props();
</script>

<ScrollViewer>
  <StackPanel class="gallery-page">
    <TextBlock class="gallery-title" text={title} />
    <TextBlock class="gallery-caption" text={caption} />
    {@render children()}
  </StackPanel>
</ScrollViewer>

<style>
  :global(.gallery-page) {
    gap: 12px;
    padding: 24px;
  }

  :global(.gallery-title) {
    font-weight: 600;
    font-size: 28px;
  }

  :global(.gallery-caption) {
    opacity: 70%;
  }
</style>
