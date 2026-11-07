<script lang="ts">
  import { FlyoutIconKind, flyoutIconOf, trailingTextOf, weightOf } from "./flyout-model.ts";
  import type { PickableItem } from "./flyout-model.ts";
  import { createPicker } from "./flyout-picker.ts";
  import { MenuItemKind } from "./menu/types.ts";
  import type { ResolvedMenuItem } from "./menu/types.ts";
  import type { TrayMenuFlyoutProps } from "./tray-menu-flyout-props.ts";
  import type { MenuFlyout as MenuFlyoutControl } from "#src/components/generated/bindings.js";
  import {
    FontIcon,
    ImageIcon,
    MenuFlyout,
    MenuFlyoutItem,
    MenuFlyoutSeparator,
    MenuFlyoutSubItem,
    RadioMenuFlyoutItem,
    ToggleMenuFlyoutItem
  } from "#src/components/index.js";
  import { control } from "#src/components/runtime.js";
  import { untrack } from "svelte";

  // The tray menu model drawn as a WinUI MenuFlyout: the lines of the model
  // resolved when the menu opens, and again after an item that stays open.
  const props: TrayMenuFlyoutProps = $props();

  function lineProps(item: PickableItem) {
    return {
      fontWeight: weightOf(item),
      isEnabled: item.isEnabled,
      keyboardAcceleratorTextOverride: trailingTextOf(item),
      onclick: () => picker.pick(item)
    };
  }

  let resolved = $state.raw<readonly ResolvedMenuItem[]>(untrack(() => props.resolve()));
  const picker = createPicker({
    close: () => props.onclose(),
    refresh() {
      resolved = props.resolve();
    },
    defer(run) {
      setTimeout(run, 0);
    }
  });
</script>

{#snippet pictogram(icon: ReturnType<typeof flyoutIconOf>)}
  {#if icon?.kind === FlyoutIconKind.GLYPH}
    <FontIcon glyph={icon.glyph} />
  {:else if icon?.kind === FlyoutIconKind.FILE}
    <ImageIcon source={icon.uri} />
  {/if}
{/snippet}

{#snippet entries(list: readonly ResolvedMenuItem[])}
  {#each list as item (item.id)}
    {#if item.kind === MenuItemKind.COMMAND}
      <MenuFlyoutItem {...lineProps(item)}>
        {#snippet icon()}
          {@render pictogram(flyoutIconOf(item.icon))}
        {/snippet}
        {item.label}
      </MenuFlyoutItem>
    {:else if item.kind === MenuItemKind.CHECK}
      <ToggleMenuFlyoutItem
        isChecked={item.isChecked}
        {...lineProps(item)}>
        {#snippet icon()}
          {@render pictogram(flyoutIconOf(item.icon))}
        {/snippet}
        {item.label}
      </ToggleMenuFlyoutItem>
    {:else if item.kind === MenuItemKind.RADIO}
      <RadioMenuFlyoutItem
        groupName={item.group}
        isChecked={item.isChecked}
        {...lineProps(item)}>
        {#snippet icon()}
          {@render pictogram(flyoutIconOf(item.icon))}
        {/snippet}
        {item.label}
      </RadioMenuFlyoutItem>
    {:else if item.kind === MenuItemKind.SUBMENU}
      <MenuFlyoutSubItem
        fontWeight={weightOf(item)}
        isEnabled={item.isEnabled}
        text={item.label}>
        {#snippet icon()}
          {@render pictogram(flyoutIconOf(item.icon))}
        {/snippet}
        {@render entries(item.items)}
      </MenuFlyoutSubItem>
    {:else if item.kind === MenuItemKind.SEPARATOR}
      <MenuFlyoutSeparator />
    {:else}
      <MenuFlyoutItem fontWeight="bold" isEnabled={false}>{item.label}</MenuFlyoutItem>
    {/if}
  {/each}
{/snippet}

{#key resolved}
  <MenuFlyout
    {@attach control((flyout: MenuFlyoutControl) => props.onflyout?.(flyout))}
    onclosed={() => picker.settle()}
    open>
    {@render entries(resolved)}
  </MenuFlyout>
{/key}
