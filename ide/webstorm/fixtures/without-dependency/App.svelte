<script lang="ts">
  import { Border, TextBlock } from "./components.js"
  import { Visibility } from "./enums.js"

  let isOn = $state(true)
</script>

<TextBlock visibility="Collapsed" />
<TextBlock visibility={Visibility.Collapsed} />
<TextBlock visibility={isOn ? Visibility.Visible : Visibility.Collapsed} />
<Border width={12} />
<Border background="#336699" />
