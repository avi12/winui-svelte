<script lang="ts">
  import { LANGUAGES, preferences } from "./preferences.svelte.ts";
  import SettingsPage from "./SettingsPage.svelte";
  import { TextBlock } from "winui-svelte/components";

  function greeting() {
    const isNameMissing = preferences.userName === "";
    return isNameMissing ? "Hello, stranger" : `Hello, ${preferences.userName}`;
  }
</script>

<SettingsPage>
  <TextBlock>winui-svelte settings example</TextBlock>
  <TextBlock>{greeting()}</TextBlock>
  <TextBlock>Language {LANGUAGES[preferences.language]}, theme {preferences.theme}</TextBlock>
  <TextBlock>Material {preferences.backdrop}</TextBlock>
</SettingsPage>
