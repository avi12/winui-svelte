<script lang="ts">
  import { LANGUAGES, preferences } from "./preferences.svelte.ts";
  import { StackPanel, TextBlock } from "winui-svelte/components";

  function greeting() {
    const isNameMissing = preferences.userName === "";
    return isNameMissing ? "Hello, stranger" : `Hello, ${preferences.userName}`;
  }
</script>

<StackPanel class="settings-page">
  <TextBlock text="winui-svelte settings example" />
  <TextBlock text={greeting()} />
  <TextBlock text="Language {LANGUAGES[preferences.language]}, theme {preferences.theme}" />
  <TextBlock text="Material {preferences.backdrop}" />
</StackPanel>
