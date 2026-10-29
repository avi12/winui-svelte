<script lang="ts">
  // Never mounted: `pnpm check` (svelte-check) reads it. Each value prop is
  // written in the forms it takes; value-props.types.ts holds the ones it refuses.
  import type { DataTemplateInput, DateInput } from "#src/components/convert.js";
  import {
    AutoSuggestBox,
    Button,
    ComboBox,
    ContentDialog,
    DatePicker,
    DoubleAnimation,
    ItemsControl,
    Path,
    Polygon,
    Rectangle,
    TextBlock,
    TextBox,
    XamlKind,
    xamlOf
  } from "#src/components/index.js";

  const rowTemplate: DataTemplateInput = xamlOf({
    kind: XamlKind.DATA_TEMPLATE,
    xaml: "<DataTemplate><TextBlock Text=\"{Binding}\"/></DataTemplate>"
  });
  let date = $state<DateInput | undefined>(new Date());
</script>

<DoubleAnimation beginTime={100} duration="0.3s" repeatBehavior="forever" />
<DoubleAnimation duration={300} repeatBehavior="3x" />
<TextBlock fontWeight="bold" />
<TextBlock fontWeight={650} />
<DatePicker bind:date />
<DatePicker date="2026-10-29" />
<Polygon points="0,0 10,0 10,10" />
<Polygon
  points={[[0, 0], {
    x: 10,
    y: 0
  }, [10, 10]]} />
<Rectangle strokeDashArray="4 2" />
<Rectangle strokeDashArray={[4, 2]} />
<Path data="M0,0 L10,10" />
<AutoSuggestBox itemsSource={["one", "two"]} />
<TextBox inputScope="Url" />
<TextBox inputScope={["Url", "Search"]} />
<Button template="<ControlTemplate TargetType='Button'><Border/></ControlTemplate>" />
<Button
  contentTemplate={rowTemplate} resources={{
    "--button-background": "#0af",
    "--button-padding": 12,
    "--is-compact": true
  }} />
<ItemsControl itemTemplate={rowTemplate} itemsPanel="<ItemsPanelTemplate><StackPanel/></ItemsPanelTemplate>" />
<ComboBox itemContainerStyle="row" />
<ContentDialog closeButtonStyle="primary-action" />
