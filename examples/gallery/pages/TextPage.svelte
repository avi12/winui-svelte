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

  const EDITOR_HEIGHT = 120;
  const SENTENCE = "Find the needle in the haystack";
  let query = $state("needle");
  function highlightRanges() {
    const match = SENTENCE.indexOf(query);
    const isMatchMissing = match < 0 || query.length === 0;
    if (isMatchMissing) {
      return [];
    }

    return [{
      startIndex: match,
      length: query.length
    }];
  }
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
        <TextHighlighter background="#ffee00" ranges={highlightRanges()} />
      {/snippet}
    </TextBlock>
    <RichEditBox header="Document" height={EDITOR_HEIGHT} />
  </StackPanel>
</PageFrame>

<style>
  :global(.text-block-demo) {
    gap: 8px;
  }
</style>
