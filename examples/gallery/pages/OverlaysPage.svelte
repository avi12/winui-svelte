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
    <TextBlock text="answers: {answers.join(", ")}" />
    <Button onclick={() => (isFlyoutOpen = true)}>Flyout</Button>
    <Flyout bind:open={isFlyoutOpen}>
      <TextBlock text="Opens beside the panel it is written in" />
    </Flyout>
    <Button>
      Menu
      {#snippet flyout()}
        <MenuFlyout bind:open={isMenuOpen}>
          <MenuFlyoutItem text="Copy" />
          <MenuFlyoutItem text="Paste" />
        </MenuFlyout>
      {/snippet}
    </Button>
    <Button onclick={() => (isTipOpen = true)}>Teaching tip</Button>
    <TeachingTip subtitle="A tip points at what it explains." title="Tip" bind:isOpen={isTipOpen} />
    <InfoBar message="Saved to disk" severity="Success" title="Done" bind:isOpen={isInfoOpen} />
  </StackPanel>
</PageFrame>

<style>
  :global(.overlay-block) {
    gap: 8px;
  }
</style>
