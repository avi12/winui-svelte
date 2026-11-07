<script generics="ItemId extends string" lang="ts">
  import {
    editorRows,
    hasTweaks,
    isCustomized,
    MoveDirection,
    moveItem,
    setItemShown,
    setLevel
  } from "./edit-profile.ts";
  import type { EditorRow } from "./edit-profile.ts";
  import { DEFAULT_EDITOR_LABELS, fillLabel } from "./editor-labels.ts";
  import type { TrayMenuEditorProps } from "./editor-props.ts";
  import { previewLines } from "./preview-lines.ts";
  import Border from "#src/components/generated/Border.svelte";
  import Button from "#src/components/generated/Button.svelte";
  import CheckBox from "#src/components/generated/CheckBox.svelte";
  import FontIcon from "#src/components/generated/FontIcon.svelte";
  import Grid from "#src/components/generated/Grid.svelte";
  import RadioButton from "#src/components/generated/RadioButton.svelte";
  import RadioButtons from "#src/components/generated/RadioButtons.svelte";
  import StackPanel from "#src/components/generated/StackPanel.svelte";
  import TextBlock from "#src/components/generated/TextBlock.svelte";
  import { describeMenu } from "#src/tray/menu/describe.js";
  import { defaultProfile } from "#src/tray/menu/profile.js";
  import { MenuItemKind, MenuLevel } from "#src/tray/menu/types.js";
  import type { MenuProfile } from "#src/tray/menu/types.js";

  // The settings page of a tray menu: a detail level, the tree of every item
  // with a check, its level and up/down buttons, and an optional preview. It
  // only edits a profile and says so (`onchange`); the app keeps the file.
  const INDENT = 24;
  const CHEVRON_UP = "";
  const CHEVRON_DOWN = "";
  const LEVELS = [MenuLevel.SIMPLE, MenuLevel.STANDARD, MenuLevel.FULL];
  let {
    items,
    profile = $bindable(defaultProfile<ItemId>()),
    onchange,
    onsave,
    labels,
    isPreviewShown = false
  }: TrayMenuEditorProps<ItemId> = $props();
  const text = $derived({
    ...DEFAULT_EDITOR_LABELS,
    ...labels
  });
  const descriptions = $derived(describeMenu({ items }));
  const rows = $derived(
    editorRows({
      descriptions,
      profile
    })
  );
  const lines = $derived(
    previewLines({
      items,
      profile
    })
  );
  const levelWords = $derived({
    [MenuLevel.SIMPLE]: text.simple,
    [MenuLevel.STANDARD]: text.standard,
    [MenuLevel.FULL]: text.full
  });

  function commit(next: MenuProfile<ItemId>) {
    profile = next;
    onchange?.(next);
  }

  function chooseLevel(index: number) {
    const level = LEVELS[index];
    const isChange = level !== undefined && level !== profile.level;
    if (isChange) {
      commit(
        setLevel({
          profile,
          level
        })
      );
    }
  }

  function toggle({ row, isShown }: {
    row: EditorRow<ItemId>;
    isShown: boolean;
  }) {
    const isChange = isShown !== row.isShown;
    const description = descriptions.find(candidate => candidate.id === row.id);
    const isEditable = isChange && description !== undefined;
    if (isEditable) {
      commit(
        setItemShown({
          profile,
          description,
          isShown
        })
      );
    }
  }

  function move({ row, direction }: {
    row: EditorRow<ItemId>;
    direction: MoveDirection;
  }) {
    commit(
      moveItem({
        profile,
        descriptions,
        id: row.id,
        direction
      })
    );
  }

  function nameOf(row: EditorRow<ItemId>) {
    const isSeparator = row.kind === MenuItemKind.SEPARATOR;
    if (isSeparator) {
      return text.separator;
    }

    return row.label;
  }
</script>

{#snippet levelRadios()}
  {#each LEVELS as level (level)}
    <RadioButton automationName={levelWords[level]} content={levelWords[level]} />
  {/each}
{/snippet}

{#snippet itemRow(row: EditorRow<ItemId>)}
  {@const name = nameOf(row)}
  <Grid class="row" margin={[row.depth * INDENT, 0, 0, 0]}>
    <CheckBox
      class="show"
      automationName={fillLabel({
        template: text.show,
        name
      })}
      content={name}
      isChecked={row.isShown}
      isEnabled={!row.isRequired}
      onchecked={() => toggle({
        row,
        isShown: true
      })}
      onunchecked={() => toggle({
        row,
        isShown: false
      })}
    />
    {#if row.isRequired}
      <TextBlock class="note">{text.required}</TextBlock>
    {/if}
    <TextBlock
      class="badge"
      automationName={fillLabel({
        template: text.levelBadge,
        name: levelWords[row.level]
      })}
    >
      {levelWords[row.level]}
    </TextBlock>
    <Button
      class="up"
      automationName={fillLabel({
        template: text.moveUp,
        name
      })}
      isEnabled={row.canMoveUp}
      onclick={() => move({
        row,
        direction: MoveDirection.UP
      })}
    >
      <FontIcon glyph={CHEVRON_UP} />
    </Button>
    <Button
      class="down"
      automationName={fillLabel({
        template: text.moveDown,
        name
      })}
      isEnabled={row.canMoveDown}
      onclick={() => move({
        row,
        direction: MoveDirection.DOWN
      })}
    >
      <FontIcon glyph={CHEVRON_DOWN} />
    </Button>
  </Grid>
{/snippet}

<StackPanel class="editor" automationName={text.title}>
  <TextBlock class="title" automationHeadingLevel="Level2">{text.title}</TextBlock>
  <StackPanel class="level">
    <RadioButtons
      automationName={text.detailLevel}
      header={text.detailLevel}
      items={levelRadios}
      maxColumns={LEVELS.length}
      onselectionchanged={sender => chooseLevel(sender.selectedIndex)}
      selectedIndex={LEVELS.indexOf(profile.level)}
    />
    {#if hasTweaks(profile)}
      <Border class="custom">
        <TextBlock automationName={text.custom}>{text.custom}</TextBlock>
      </Border>
    {/if}
  </StackPanel>
  <TextBlock class="heading" automationHeadingLevel="Level3">{text.items}</TextBlock>
  <StackPanel class="tree" automationName={text.items}>
    {#each rows as row (row.id)}
      {@render itemRow(row)}
    {/each}
  </StackPanel>
  <StackPanel class="actions">
    <Button
      automationName={text.resetToDefault}
      isEnabled={isCustomized(profile)}
      onclick={() => commit(defaultProfile<ItemId>())}
    >
      {text.resetToDefault}
    </Button>
    {#if onsave}
      <Button automationName={text.save} onclick={() => onsave(profile)}>{text.save}</Button>
    {/if}
  </StackPanel>
  {#if isPreviewShown}
    <TextBlock class="heading" automationHeadingLevel="Level3">{text.preview}</TextBlock>
    <Border class="preview" automationName={text.preview}>
      <StackPanel>
        {#each lines as line (line.id)}
          <TextBlock margin={[line.depth * INDENT, 0, 0, 0]}>{line.text}</TextBlock>
        {:else}
          <TextBlock>{text.previewEmpty}</TextBlock>
        {/each}
      </StackPanel>
    </Border>
  {/if}
</StackPanel>

<style>
  .editor {
    gap: 12px;
  }

  .title {
    font-weight: 600;
    font-size: 20px;
  }

  .heading {
    font-weight: 600;
    font-size: 14px;
  }

  .level {
    flex-direction: row;
    gap: 16px;
  }

  .custom {
    align-self: center;
    padding: 2px 8px;
    border-color: var(--control-stroke-color-default);
    border-width: 1px;
  }

  .tree {
    gap: 4px;
  }

  .row {
    grid-template-columns: 1fr auto auto auto auto;
    justify-self: stretch;
  }

  .show {
    grid-column: 1;
  }

  .note {
    grid-column: 2;
    align-self: center;
    margin-right: 12px;
    color: var(--text-fill-color-secondary);
    font-size: 12px;
  }

  .badge {
    grid-column: 3;
    align-self: center;
    margin-right: 12px;
    color: var(--text-fill-color-secondary);
    font-size: 12px;
  }

  .up {
    grid-column: 4;
  }

  .down {
    grid-column: 5;
    margin-left: 4px;
  }

  .actions {
    flex-direction: row;
    gap: 8px;
  }

  .preview {
    padding: 12px;
    border-color: var(--card-stroke-color-default);
    border-width: 1px;
    background-color: var(--card-background-fill-color-default);
  }
</style>
