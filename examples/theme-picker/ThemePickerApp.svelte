<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { ComboBox, ComboBoxItem, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 300;
  const WINDOW_WIDTH = 400;
  const INITIAL_NAME = "gamma";

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();

  let names = $state(["alpha", "beta", "gamma", "delta"]);
  let assigned = $state(INITIAL_NAME);
  let changes = 0;

  function report(kind: string) {
    host.report({
      kind,
      order: names.join(","),
      selectedIndex: names.indexOf(assigned),
      changes
    });
  }

  function pick(index: number) {
    changes++;
    assigned = names[index] ?? assigned;
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["swap", command => {
      const from = Number(command["from"]);
      const to = Number(command["to"]);
      const next = [...names];
      const moved = next.splice(from, 1);
      next.splice(to, 0, ...moved);
      names = next;
      report("swapped");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  title="Theme picker example"
  width={WINDOW_WIDTH}
>
  <ComboBox automationId="picker" bind:selectedIndex={() => names.indexOf(assigned), pick}>
    {#each names as name (name)}
      <ComboBoxItem>{name}</ComboBoxItem>
    {/each}
  </ComboBox>
</Window>
