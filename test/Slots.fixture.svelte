<script lang="ts">
  // Children and snippet props in the properties they fill, for the mount
  // test (mount-all.svelte.ts): each control written the way a XAML app
  // writes it, a pane, commands, menu items, inlines, a flyout, a header and
  // a paragraph holding a control, items written with {#each}, and value
  // objects (a brush with stops, a transform, a storyboard) in their properties,
  // and the value objects that are no element: swipe items, a map's layers, a
  // text block's highlights, a rating control's glyph and a tool tip.
  // Each control is handed to the test by name.
  import {
    AppBarButton,
    Bold,
    Border,
    Button,
    ComboBox,
    ComboBoxItem,
    CommandBar,
    ContentDialog,
    DoubleAnimation,
    Flyout,
    GradientStop,
    InlineUIContainer,
    LinearGradientBrush,
    MapControl,
    MapElementsLayer,
    MapIcon,
    MenuFlyout,
    MenuFlyoutItem,
    NavigationView,
    NavigationViewItem,
    Paragraph,
    RatingControl,
    RatingItemFontInfo,
    RichTextBlock,
    RotateTransform,
    SplitView,
    StackPanel,
    Storyboard,
    SwipeControl,
    SwipeItem,
    SwipeItems,
    TextBlock,
    TextHighlighter,
    ToggleSwitch
  } from "#src/components/index.js";
  import { control } from "#src/index.js";

  interface Props {
    isShown: boolean;
    onFound: (found: {
      name: string;
      native: object;
    }) => void;
  }

  const props: Props = $props();

  function found(name: string) {
    return control((native: object) => props.onFound({
      name,
      native
    }));
  }
</script>

<StackPanel>
  <ComboBox {@attach found("comboBox")}>
    {#each ["One", "Two"] as label (label)}
      <ComboBoxItem content={label} />
    {/each}
    {#if props.isShown}
      <ComboBoxItem content="Three" />
    {/if}
  </ComboBox>
  <Border {@attach found("gradientBorder")}>
    {#snippet background()}
      <LinearGradientBrush>
        <GradientStop color="#000000" offset={0} />
        <GradientStop color="#ffffff" offset={1} />
      </LinearGradientBrush>
    {/snippet}
  </Border>
  <Border {@attach found("rotatedBorder")}>
    {#snippet renderTransform()}
      <RotateTransform angle={45} />
    {/snippet}
  </Border>
  <Storyboard {@attach found("storyboard")}>
    <DoubleAnimation to={1.5} />
  </Storyboard>
  <SplitView {@attach found("splitView")}>
    {#snippet pane()}
      <StackPanel />
    {/snippet}
    <TextBlock>Content</TextBlock>
  </SplitView>
  <CommandBar {@attach found("commandBar")}>
    <AppBarButton label="Save" />
    {#snippet secondaryCommands()}
      {#if props.isShown}
        <AppBarButton label="Settings" />
      {/if}
    {/snippet}
  </CommandBar>
  <NavigationView {@attach found("navigationView")}>
    {#snippet menuItems()}
      <NavigationViewItem content="Home" />
      {#if props.isShown}
        <NavigationViewItem content="Library" />
      {/if}
    {/snippet}
  </NavigationView>
  <TextBlock {@attach found("textBlock")}>Hello <Bold>bold</Bold> world</TextBlock>
  <Button {@attach found("button")}>
    Open
    {#snippet flyout()}
      <MenuFlyout>
        <MenuFlyoutItem>Copy</MenuFlyoutItem>
        <MenuFlyoutItem>Paste</MenuFlyoutItem>
      </MenuFlyout>
    {/snippet}
  </Button>
  <Flyout {@attach found("flyout")} open={props.isShown}>
    <TextBlock>Details</TextBlock>
  </Flyout>
  <ContentDialog {@attach found("dialog")} closeButtonText="Close" open={props.isShown}>Sure?</ContentDialog>
  <ToggleSwitch {@attach found("toggleSwitch")}>Wi-Fi</ToggleSwitch>
  <RichTextBlock {@attach found("richTextBlock")}>
    <Paragraph>
      Press <InlineUIContainer><Button>here</Button></InlineUIContainer>
    </Paragraph>
  </RichTextBlock>
  <SwipeControl {@attach found("swipeControl")}>
    Row
    {#snippet leftItems()}
      <SwipeItems>
        <SwipeItem text="Delete" />
        <SwipeItem text="Flag" />
      </SwipeItems>
    {/snippet}
  </SwipeControl>
  <TextBlock {@attach found("highlightedText")}>
    Highlight me
    {#snippet textHighlighters()}
      <TextHighlighter
        background="#ffee00" ranges={[{
          startIndex: 0,
          length: 9
        }]} />
    {/snippet}
  </TextBlock>
  <RatingControl {@attach found("ratingControl")}>
    {#snippet itemInfo()}
      <RatingItemFontInfo glyph="*" />
    {/snippet}
  </RatingControl>
  <Button {@attach found("tipButton")}>
    Hover me
    {#snippet toolTip()}
      <TextBlock>Tip</TextBlock>
    {/snippet}
  </Button>
  <MapControl {@attach found("mapControl")}>
    {#snippet layers()}
      <MapElementsLayer>
        {#snippet mapElements()}
          <MapIcon />
        {/snippet}
      </MapElementsLayer>
    {/snippet}
  </MapControl>
</StackPanel>
