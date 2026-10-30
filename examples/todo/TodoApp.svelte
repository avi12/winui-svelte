<script lang="ts">
  import type { Todo, TodoAction, TodoList } from "./todo-host.ts";
  import { startTodoHost, TODO_NAME } from "./todo-host.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { keyControl, serveExample } from "#examples/harness/smoke.ts";
  import { ContentDialogResult } from "#winui/microsoft/ui/xaml/controls/ContentDialogResult";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import {
    Button,
    CheckBox,
    ContentDialog,
    Grid,
    InfoBar,
    ListView,
    StackPanel,
    TextBlock,
    TextBox,
    Window
  } from "winui-svelte/components";
  import { createHostChannel, hostState } from "winui-svelte/state";

  const WINDOW_HEIGHT = 560;
  const WINDOW_WIDTH = 480;
  const DEFAULT_FILE = join(tmpdir(), "winui-svelte-todo.json");

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // svelte-ignore state_referenced_locally
  const channel = createHostChannel<TodoAction>({ transport: startTodoHost(host.options["file"] ?? DEFAULT_FILE) });
  const list = hostState<TodoList>({
    channel,
    name: TODO_NAME
  });
  let title = $state("");
  let problem = $state("");
  let selectedKey = $state<string | undefined>();
  let isClearOpen = $state(false);
  const todos = $derived(list.current?.todos ?? []);
  const tally = $derived.by(() => ({
    done: todos.filter(todo => todo.isDone).length,
    isAnyDone: todos.some(todo => todo.isDone)
  }));

  async function send(action: TodoAction) {
    try {
      await channel.send(action);
      problem = "";
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
  }

  async function add() {
    await send({
      kind: "add",
      title
    });
    const isAdded = problem === "";
    if (isAdded) {
      title = "";
    }
  }

  function byKey(todo: Todo) {
    return String(todo.id);
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["add", command => {
      title = String(command["title"]);
      void add().then(() => host.report({
        kind: "added",
        count: todos.length
      }));
    }]
  ]);
  // svelte-ignore state_referenced_locally
  serveExample({
    host,
    commands
  });
  $effect(() => () => channel.dispose());
</script>

<Window height={WINDOW_HEIGHT} title="Todo" width={WINDOW_WIDTH}>
  <StackPanel class="todo">
    <TextBlock class="todo-title" text="Todo" />
    <Grid class="todo-add">
      <TextBox
        {@attach keyControl("todo")}
        gridColumn={0}
        placeholderText="What needs doing?"
        bind:text={title}
      />
      <Button gridColumn={1} onClick={add}>Add</Button>
    </Grid>
    {#if problem !== ""}
      <InfoBar isClosable={false} isOpen message={problem} severity="Warning" />
    {/if}
    <ListView class="todo-list" items={todos} key={byKey} bind:selectedKey>
      {#snippet item(todo)}
        <Grid class="todo-row">
          <CheckBox
            gridColumn={0} isChecked={todo.isDone} onClick={() => send({
              kind: "toggle",
              id: todo.id
            })}>
            {todo.title}
          </CheckBox>
          <Button
            gridColumn={1} onClick={() => send({
              kind: "remove",
              id: todo.id
            })}>Remove</Button>
        </Grid>
      {/snippet}
    </ListView>
    <TextBlock text="{todos.length} tasks, {tally.done} done" />
    <Button isEnabled={tally.isAnyDone} onClick={() => (isClearOpen = true)}>Clear done</Button>
    <ContentDialog
      closeButtonText="Keep them"
      onResult={result => result === ContentDialogResult.Primary && send({
        kind: "clear"
      })}
      primaryButtonText="Clear"
      title="Clear the finished tasks?"
      bind:open={isClearOpen}
    >
      {tally.done} finished tasks will be removed.
    </ContentDialog>
  </StackPanel>
</Window>

<style>
  :global(.todo) {
    gap: 8px;
    padding: 16px;
  }

  :global(.todo-title) {
    font-weight: 600;
    font-size: 28px;
  }

  :global(.todo-add) {
    grid-template-columns: 1fr auto;
    column-gap: 8px;
  }

  :global(.todo-row) {
    grid-template-columns: 1fr auto;
    column-gap: 8px;
  }

  :global(.todo-list) {
    height: 280px;
  }
</style>
