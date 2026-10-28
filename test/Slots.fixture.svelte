<script lang="ts">
  // Children and snippet props in the properties they fill, for the mount
  // test (mount-all.svelte.ts): each control written the way a XAML app
  // writes it, a pane, commands, menu items, inlines, a flyout, a header and
  // a paragraph holding a control.
  // Each control is handed to the test by name.
  import {
    AppBarButton,
    Bold,
    Button,
    CommandBar,
    InlineUIContainer,
    MenuFlyout,
    MenuFlyoutItem,
    NavigationView,
    NavigationViewItem,
    Paragraph,
    RichTextBlock,
    SplitView,
    StackPanel,
    TextBlock,
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
  <ToggleSwitch {@attach found("toggleSwitch")}>Wi-Fi</ToggleSwitch>
  <RichTextBlock {@attach found("richTextBlock")}>
    <Paragraph>
      Press <InlineUIContainer><Button>here</Button></InlineUIContainer>
    </Paragraph>
  </RichTextBlock>
</StackPanel>
