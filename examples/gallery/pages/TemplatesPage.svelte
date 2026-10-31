<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    Button,
    ComboBox,
    ComboBoxItem,
    StackPanel,
    TextBlock,
    XamlKind,
    xamlOf
  } from "winui-svelte/components";

  const ROUND_TEMPLATE = xamlOf({
    kind: XamlKind.CONTROL_TEMPLATE,
    xaml: `<ControlTemplate TargetType="Button">
      <Border Background="Teal" CornerRadius="16" Padding="16,6">
        <ContentPresenter HorizontalAlignment="Center" />
      </Border>
    </ControlTemplate>`
  });
  const NAMES = ["One", "Two", "Three"];
</script>

<PageFrame
  caption="A template is XAML text, loaded once with xamlOf and handed to as many controls as need it. A Style prop takes the CSS class names."
  title="Templates"
>
  <StackPanel class="template-block">
    <Button {@attach keyControl("templates")} template={ROUND_TEMPLATE}>Round button</Button>
    <Button template={ROUND_TEMPLATE}>The same template</Button>
    <Button
      resources={{
        "--button-background": "#6b2fa0",
        "--button-padding": 16
      }}>Resources</Button>
    <ComboBox header="Rows styled by class" itemContainerStyle="template-row">
      {#each NAMES as name (name)}
        <ComboBoxItem content={name} />
      {/each}
    </ComboBox>
    <TextBlock>The class template-row is a rule below</TextBlock>
  </StackPanel>
</PageFrame>

<style>
  .template-block {
    gap: 8px;
  }

  .template-row {
    padding: 12px;
    background-color: #123456;
  }
</style>
