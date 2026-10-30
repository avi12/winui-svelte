import App from "./App.svelte";
import { mountControl } from "winui-svelte";
import { AppBarClosedDisplayMode } from "winui-svelte/enums";
import type { Orientation } from "winui-svelte/enums";

const VERTICAL: Orientation = 1;
mountControl({
  component: App,
  props: {}
});
console.log(AppBarClosedDisplayMode.Minimal, VERTICAL);
