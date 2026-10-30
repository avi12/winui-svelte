<script lang="ts">
  import SignupForm from "./SignupForm.svelte";
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import { StackPanel, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 760;
  const WINDOW_WIDTH = 520;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  let submitted = $state(0);
  let last = $state("");

  function snapshot(kind: string) {
    host.report({
      kind,
      submitted,
      last
    });
  }

  const commands = new Map<string, () => void>([
    ["stats", () => snapshot("stats")],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.());
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Form example"
  width={WINDOW_WIDTH}
>
  <StackPanel class="app">
    <SignupForm
      onsubmitted={data => {
        submitted++;
        last = JSON.stringify(data);
        snapshot("submitted");
      }}
    />
  </StackPanel>
</Window>

<style>
  .app {
    padding: 24px;
  }
</style>
