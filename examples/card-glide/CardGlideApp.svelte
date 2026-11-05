<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { Border as BorderControl } from "#winui/microsoft/ui/xaml/controls/Border";
  import { control, glideHeight } from "winui-svelte";
  import { TextBlock, Window } from "winui-svelte/components";
  import { enableElementAnimation } from "winui-svelte/element-animation";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 400;
  const WINDOW_WIDTH = 300;
  const GLIDE_MILLISECONDS = 600;
  const SHORT_TEXT = "One line";
  const LONG_TEXT = "Many lines of text, long enough to wrap onto several lines in a narrow card, so the card grows";

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  let text = $state(SHORT_TEXT);
  let card: BorderControl | undefined;

  enableElementAnimation();

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      height: card?.actualHeight ?? 0,
      isHeightFixed: !Number.isNaN(card?.height ?? Number.NaN)
    })],
    ["grow", () => {
      text = LONG_TEXT;
      host.report({ kind: "grown" });
    }],
    ["shrink", () => {
      text = SHORT_TEXT;
      host.report({ kind: "shrunk" });
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window height={WINDOW_HEIGHT} onclosed={exitApplication} title="Card glide example" width={WINDOW_WIDTH}>
  <border
    class="card"
    {@attach control<BorderControl>(native => {
      card = native;
    })}
    {@attach glideHeight({ duration: GLIDE_MILLISECONDS })}
  >
    <TextBlock textWrapping="Wrap">{text}</TextBlock>
  </border>
</Window>

<style>
  .card {
    align-self: start;
    padding: 16px;
  }
</style>
