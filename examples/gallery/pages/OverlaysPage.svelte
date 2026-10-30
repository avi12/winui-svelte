<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    Button,
    ContentDialog,
    Flyout,
    InfoBar,
    MenuFlyout,
    MenuFlyoutItem,
    StackPanel,
    TeachingTip,
    TextBlock
  } from "winui-svelte/components";
  import { InfoBarSeverity } from "winui-svelte/enums";

  let isFirstOpen = $state(false);
  let isSecondOpen = $state(false);
  let isFlyoutOpen = $state(false);
  let isMenuOpen = $state(false);
  let isTipOpen = $state(false);
  let isInfoOpen = $state(true);
  const answers = $state<string[]>([]);

  function askBoth() {
    isFirstOpen = true;
    isSecondOpen = true;
  }
</script>

<PageFrame
  caption="Every overlay opens from state. Two dialogs asked for together queue, because WinUI shows one at a time."
  title="Overlays"
>
  <StackPanel class="overlay-block">
    <Button {@attach keyControl("overlays")} onclick={askBoth}>Two dialogs</Button>
    <ContentDialog
      closeButtonText="Close"
      onresult={result => answers.push(`first: ${result}`)}
      primaryButtonText="OK"
      title="First"
      bind:open={isFirstOpen}
    >
      The first dialog
    </ContentDialog>
    <ContentDialog
      closeButtonText="Close"
      onresult={result => answers.push(`second: ${result}`)}
      title="Second"
      bind:open={isSecondOpen}
    >
      The second one waited for the first
    </ContentDialog>
    <TextBlock>answers: {answers.join(", ")}</TextBlock>
    <Button onclick={() => (isFlyoutOpen = true)}>Flyout</Button>
    <Flyout bind:open={isFlyoutOpen}>
      <TextBlock>Opens beside the panel it is written in</TextBlock>
    </Flyout>
    <Button>
      Menu
      {#snippet flyout()}
        <MenuFlyout bind:open={isMenuOpen}>
          <MenuFlyoutItem>Copy</MenuFlyoutItem>
          <MenuFlyoutItem>Paste</MenuFlyoutItem>
        </MenuFlyout>
      {/snippet}
    </Button>
    <Button onclick={() => (isTipOpen = true)}>Teaching tip</Button>
    <TeachingTip subtitle="A tip points at what it explains." title="Tip" bind:isOpen={isTipOpen} />
    <InfoBar message="Saved to disk" severity={InfoBarSeverity.Success} title="Done" bind:isOpen={isInfoOpen} />
  </StackPanel>
</PageFrame>

<style>
  .overlay-block {
    gap: 8px;
  }
</style>
