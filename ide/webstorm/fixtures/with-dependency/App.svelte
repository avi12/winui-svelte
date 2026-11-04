<script lang="ts">
  import { Border, TextBlock } from "winui-svelte/components"
  import { Visibility } from "winui-svelte/enums"

  let isOn = $state(true)
  const pick = () => Visibility.Collapsed
</script>

<TextBlock visibility="Collapsed" /> <!-- convert -->
<TextBlock visibility={Visibility.Collapsed} /> <!-- convert -->
<TextBlock visibility={isOn ? Visibility.Visible : Visibility.Collapsed} /> <!-- convert -->
<Border width={12} /> <!-- convert -->
<Border opacity={0.5} /> <!-- convert -->
<Border background="#336699" /> <!-- convert -->
<Border padding={[1, 2, 3, 4]} /> <!-- convert -->
<Border cornerRadius={4} /> <!-- convert -->
<Border isHitTestVisible={false} /> <!-- convert -->
<TextBlock text="hello" />
<TextBlock visibility={pick()} />
<TextBlock visibility="Collapsed" style:display="block" /> <!-- convert -->
<TextBlock foreground="SystemAccentColor" />
<div visibility="Collapsed"></div>
