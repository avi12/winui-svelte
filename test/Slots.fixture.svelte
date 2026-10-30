<script lang="ts">
  // Children and snippet props in the properties they fill, for the mount
  // test (mount-all.svelte.ts): each control written the way a XAML app
  // writes it, a pane, commands, menu items, inlines, a flyout, a header and
  // a paragraph holding a control, items written with {#each}, a tree of items, and value
  // objects (a brush with stops, a transform, a storyboard) in their properties,
  // transitions in the collections WinUI leaves null, a navigator that
  // shows the page its history is at, and the value objects that are no
  // element: swipe items, a map's layers, a text block's highlights, a rating
  // control's glyph and a tool tip, and the visual state groups of a panel with
  // a state that has a trigger and a setter.
  // Each control is handed to the test by name.
  import NavigationPage from "./NavigationPage.fixture.svelte";
  import {
    AdaptiveTrigger,
    AppBarButton,
    Bold,
    Border,
    Button,
    ComboBox,
    ComboBoxItem,
    CommandBar,
    ContentDialog,
    DoubleAnimation,
    EntranceThemeTransition,
    Flyout,
    GradientStop,
    Grid,
    GroupStyle,
    InlineUIContainer,
    LinearGradientBrush,
    ListBox,
    MapControl,
    MapElementsLayer,
    MapIcon,
    MenuFlyout,
    MenuFlyoutItem,
    NavigationView,
    NavigationViewItem,
    Navigator,
    Paragraph,
    PopupThemeTransition,
    RatingControl,
    RatingItemFontInfo,
    RepositionThemeTransition,
    RichTextBlock,
    RotateTransform,
    Setter,
    SplitView,
    StackPanel,
    Storyboard,
    SwipeControl,
    SwipeItem,
    SwipeItems,
    TextBlock,
    TextHighlighter,
    ToggleSwitch,
    TreeView,
    VisualState,
    VisualStateGroup,
    VisualStateGroups
  } from "#src/components/index.js";
  import type { NavigatorHandle } from "#src/components/index.js";
  import { control } from "#src/index.js";
  import type { UIElement } from "#src/winui.js";
  import { untrack } from "svelte";

  interface Props {
    isShown: boolean;
    onFound: (found: {
      name: string;
      native: object;
    }) => void;
  }

  const props: Props = $props();
  let navigator = $state<NavigatorHandle | undefined>();
  let stateTarget = $state.raw<UIElement | undefined>();

  $effect(() => {
    const label = props.isShown ? "Second" : "First";
    untrack(() => navigator?.navigate({
      page: NavigationPage,
      params: {
        label
      }
    }));
  });

  interface Folder {
    name: string;
    children: Folder[];
  }

  const src: Folder = {
    name: "src",
    children: [{
      name: "app",
      children: []
    }]
  };
  const docs: Folder = {
    name: "docs",
    children: []
  };

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
  <StackPanel {@attach found("transitionPanel")}>
    {#snippet childrenTransitions()}
      <EntranceThemeTransition />
      <RepositionThemeTransition />
    {/snippet}
    {#snippet transitions()}
      <PopupThemeTransition />
    {/snippet}
  </StackPanel>
  <Navigator {@attach found("navigator")} bind:handle={navigator} />
  <Navigator
    {@attach found("readyNavigator")}
    onready={ready => ready.navigate({
      page: NavigationPage,
      params: {
        label: "Ready"
      }
    })}
  />
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
  <TreeView
    {@attach found("treeView")}
    children={folder => folder.children}
    expandedKeys={["src"]}
    items={props.isShown ? [src, docs] : [src]}
    key={folder => folder.name}
  >
    {#snippet item(folder)}
      <TextBlock>{folder.name}</TextBlock>
    {/snippet}
  </TreeView>
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
  <ListBox {@attach found("groupedList")}>
    {#snippet groupStyle()}
      <GroupStyle hidesIfEmpty />
    {/snippet}
  </ListBox>
  <Grid {@attach found("stateGrid")}>
    <Border
{@attach control((native: UIElement) => {
  stateTarget = native;
  props.onFound({
    name: "stateTarget",
    native
  });
})} />
    <VisualStateGroups>
      <VisualStateGroup name="Sizes">
        <VisualState name="Wide">
          {#snippet stateTriggers()}
            <AdaptiveTrigger minWindowWidth={640} />
          {/snippet}
          {#snippet setters()}
            {#if stateTarget}
              <Setter path="Opacity" target={stateTarget} value={0.5} />
            {/if}
          {/snippet}
        </VisualState>
      </VisualStateGroup>
    </VisualStateGroups>
  </Grid>
</StackPanel>
