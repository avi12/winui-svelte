<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    Bold,
    Hyperlink,
    Paragraph,
    RichEditBox,
    RichTextBlock,
    Run,
    StackPanel,
    TextBlock,
    TextBox,
    TextHighlighter
  } from "winui-svelte/components";

  const SENTENCE = "Find the needle in the haystack";
  let query = $state("needle");
  const start = $derived(SENTENCE.indexOf(query));
  const ranges = $derived(
    start < 0 || query.length === 0 ? [] : [{
      startIndex: start,
      length: query.length
    }]
  );
</script>

<PageFrame
  caption="Rich text is made of inlines, written as children. A highlighter marks ranges, and a rich edit box edits a document."
  title="Text and documents"
>
  <StackPanel class="text-block-demo">
    <RichTextBlock {@attach keyControl("text")}>
      <Paragraph>
        Plain, <Bold>bold</Bold>, a <Run text="run" /> and a <Hyperlink navigateUri="https://github.com">link</Hyperlink>.
      </Paragraph>
    </RichTextBlock>
    <TextBox header="Highlight" bind:text={query} />
    <TextBlock text={SENTENCE}>
      {#snippet textHighlighters()}
        <TextHighlighter background="#ffee00" {ranges} />
      {/snippet}
    </TextBlock>
    <RichEditBox header="Document" height={120} />
  </StackPanel>
</PageFrame>

<style>
  :global(.text-block-demo) {
    gap: 8px;
  }
</style>
