<script lang="ts">
  import GlyphButton from "./GlyphButton.svelte";
  import { send, view } from "./view.svelte.ts";
  import {
    MenuFlyout,
    MenuFlyoutItem,
    MenuFlyoutSeparator,
    MenuFlyoutSubItem,
    RadioMenuFlyoutItem,
    ToggleMenuFlyoutItem
  } from "winui-svelte/components";

  interface Props {
    column: number;
  }

  const props: Props = $props();

  const ENGINES = ["Google", "OpenAI"];
  const GOOGLE_ENGINE = "Google";

  const facts = $derived({
    isCameraAvailable: view.engine === GOOGLE_ENGINE,
    isUpdateAvailable: view.update !== null
  });
</script>

{#snippet menu()}
  <!--
    placement="Top" is FlyoutPlacementMode.Top, the default of FlyoutBase:
    WinUI opens the menu above the button and flips it below when there is no
    room. GAP: the window is only as tall as its content, and a flyout is
    clipped to the window unless shouldConstrainToRootBounds is false (set
    below). Not run: whether the popup shows outside a window that is not
    activatable is unconfirmed
  -->
  <MenuFlyout placement="Top" shouldConstrainToRootBounds={false}>
    <MenuFlyoutSubItem text="Microphone">
      <RadioMenuFlyoutItem
        groupName="microphone"
        isChecked={view.microphoneId === null}
        onclick={() => send({
          kind: "setMicrophone",
          microphoneId: null
        })}
        text="Windows default"
      />
      {#each view.microphones as microphone (microphone.id)}
        <RadioMenuFlyoutItem
          groupName="microphone"
          isChecked={view.microphoneId === microphone.id}
          onclick={() => send({
            kind: "setMicrophone",
            microphoneId: microphone.id
          })}
          text={microphone.name}
        />
      {/each}
    </MenuFlyoutSubItem>
    {#if facts.isCameraAvailable}
      <ToggleMenuFlyoutItem
        isChecked={view.isCameraShared}
        onclick={() => send({
          kind: "setCamera",
          isOn: !view.isCameraShared
        })}
        text="Camera instead of screen"
      />
    {/if}
    <MenuFlyoutSubItem text="Gemini runs on">
      {#each ENGINES as engine (engine)}
        <RadioMenuFlyoutItem
          groupName="engine"
          isChecked={view.engine === engine}
          onclick={() => send({
            kind: "setEngine",
            engine
          })}
          text={engine}
        />
      {/each}
      <MenuFlyoutSeparator />
      <MenuFlyoutItem onclick={() => send({ kind: "askForKey" })} text="API key..." />
    </MenuFlyoutSubItem>
    {#if facts.isUpdateAvailable}
      <MenuFlyoutSeparator />
      <MenuFlyoutItem onclick={() => send({ kind: "update" })} text={view.update?.text ?? ""} />
    {/if}
    <MenuFlyoutSeparator />
    <MenuFlyoutItem onclick={() => send({ kind: "quit" })} text="Quit Gemini Live" />
  </MenuFlyout>
{/snippet}

<GlyphButton column={props.column} flyout={menu} glyph="Settings" label="Settings" />
