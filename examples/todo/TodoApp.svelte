<script lang="ts">
  import type { Todo, TodoAction, TodoList } from "./todo-host.ts";
  import { startTodoHost, TODO_NAME } from "./todo-host.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { keyControl, serveExample } from "#examples/harness/smoke.ts";
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
  import { ContentDialogResult, InfoBarSeverity } from "winui-svelte/enums";
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
    <TextBlock class="title">Todo</TextBlock>
    <Grid class="add">
      <TextBox
        {@attach keyControl("todo")}
        placeholderText="What needs doing?"
        bind:text={title}
      />
      <Button class="add-button" onclick={add}>Add</Button>
    </Grid>
    {#if problem !== ""}
      <InfoBar isClosable={false} isOpen message={problem} severity={InfoBarSeverity.Warning} />
    {/if}
    <ListView class="todo-list" items={todos} key={byKey} bind:selectedKey>
      {#snippet item(todo)}
        <Grid class="row">
          <CheckBox
            isChecked={todo.isDone} onclick={() => send({
              kind: "toggle",
              id: todo.id
            })}>
            {todo.title}
          </CheckBox>
          <Button
            class="row-remove" onclick={() => send({
              kind: "remove",
              id: todo.id
            })}>Remove</Button>
        </Grid>
      {/snippet}
    </ListView>
    <TextBlock>{todos.length} tasks, {tally.done} done</TextBlock>
    <Button isEnabled={tally.isAnyDone} onclick={() => (isClearOpen = true)}>Clear done</Button>
    <ContentDialog
      closeButtonText="Keep them"
      onresult={result => result === ContentDialogResult.Primary && send({
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
  .todo {
    gap: 8px;
    padding: 16px;
  }

  .title {
    font-weight: 600;
    font-size: 28px;
  }

  .add,
  .row {
    grid-template-columns: 1fr auto;
    column-gap: 8px;
  }

  .add-button,
  .row-remove {
    grid-column: 2;
  }

  /* ListView is a component: svelte-check cannot see a scoped class on an instance */
  .todo-list {
    height: 280px;
  }
</style>
