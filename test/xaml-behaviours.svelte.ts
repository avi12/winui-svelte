import * as bindings from "#src/components/generated/bindings.js";
import { XamlKind } from "#src/components/xaml-source.js";
import { goToState, xamlOf } from "#src/components/xaml.js";
import { registerStyleSheet } from "#src/css/index.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { translateStyleSheet } from "#src/css/translate/translate.js";
import { boxed } from "#src/renderer/host/values.js";
import assert from "node:assert/strict";

// What the template, style and resources props make of the XAML text, the CSS
// classes and the record they are given (mount-all.svelte.ts runs these with
// the other behaviours, against a real WinUI).

const BUTTON_TEMPLATE = `<ControlTemplate TargetType="Button">
  <Border x:Name="Marker" Background="#336699"><ContentPresenter/></Border>
</ControlTemplate>`;
const STATE_TEMPLATE = `<ControlTemplate TargetType="Button"><Grid>
  <VisualStateManager.VisualStateGroups><VisualStateGroup x:Name="CommonStates">
    <VisualState x:Name="Normal"/><VisualState x:Name="Pressed"/>
  </VisualStateGroup></VisualStateManager.VisualStateGroups>
  <ContentPresenter/>
</Grid></ControlTemplate>`;
const STYLE_XAML = "<Style TargetType=\"Button\"><Setter Property=\"Padding\" Value=\"3\"/></Style>";
const ITEM_TEMPLATE = "<DataTemplate><TextBlock Text=\"{Binding}\"/></DataTemplate>";
const PANEL_TEMPLATE = "<ItemsPanelTemplate><StackPanel Orientation=\"Horizontal\"/></ItemsPanelTemplate>";
const ROW_SHEET = ".row { padding: 8px; background-color: #123456 }";
const ROW_SETTERS = 2;
const CUSTOM_PADDING = 20;
const DEFAULT_THEME = "Default";

interface Checks {
  check(check: {
    name: string;
    action: () => void;
  }): void;
  checkProps(check: {
    name: string;
    component: string;
    control: object;
    props: object;
    verify: () => void;
  }): void;
}

function themeDictionary(dictionary: bindings.ResourceDictionary) {
  const themes = dictionary.themeDictionaries;
  assert.ok(themes !== null, "the dictionary has no theme dictionaries");
  return bindings.projectAs(themes.lookup(boxed(DEFAULT_THEME)), bindings.ResourceDictionary);
}

/** Registers the checks of the XAML props with the mount test's runner. */
export function checkXamlBehaviours({ check, checkProps }: Checks) {
  const templated = new bindings.Button();
  checkProps({
    name: "XAML text is a ControlTemplate (Button.template)",
    component: "Button",
    control: templated,
    props: {
      template: BUTTON_TEMPLATE
    },
    verify() {
      assert.ok(templated.template.targetType.name.endsWith("Button"), "the template's TargetType is not Button");
      assert.ok(templated.applyTemplate(), "the control did not apply the template");
      const root = bindings.projectAs(bindings.VisualTreeHelper.getChild(templated, 0), bindings.Border);
      assert.equal(root.name, "Marker", "the template's Border is not what the control shows");
    }
  });

  const contented = new bindings.Button();
  checkProps({
    name: "XAML text is a DataTemplate (Button.contentTemplate)",
    component: "Button",
    control: contented,
    props: {
      contentTemplate: ITEM_TEMPLATE,
      content: "shown"
    },
    verify() {
      assert.ok(contented.contentTemplate !== null, "the data template was not written");
    }
  });

  const listed = new bindings.ItemsControl();
  checkProps({
    name: "XAML text is a DataTemplate and an ItemsPanelTemplate (ItemsControl)",
    component: "ItemsControl",
    control: listed,
    props: {
      itemTemplate: ITEM_TEMPLATE,
      itemsPanel: PANEL_TEMPLATE,
      itemsSource: ["one", "two"]
    },
    verify() {
      assert.ok(listed.itemTemplate !== null, "the item template was not written");
      assert.ok(listed.itemsPanel !== null, "the items panel was not written");
    }
  });

  const kept = new bindings.Button();
  checkProps({
    name: "a template object is used as it is (Button.template)",
    component: "Button",
    control: kept,
    props: {
      template: templated.template
    },
    verify() {
      assert.ok(kept.template !== null, "the template object was not written");
    }
  });

  check({
    name: "xamlOf loads a style and refuses XAML of another kind",
    action() {
      const style = xamlOf({
        kind: XamlKind.STYLE,
        xaml: STYLE_XAML
      });
      assert.ok(style.targetType.name.endsWith("Button"), "the style's TargetType is not Button");
      assert.equal(style.setters.size, 1, "the style does not hold its setter");
      assert.throws(
        () => xamlOf({
          kind: XamlKind.CONTROL_TEMPLATE,
          xaml: ITEM_TEMPLATE
        }),
        /controlTemplate starts with <ControlTemplate>, this XAML starts with <DataTemplate>/u
      );
    }
  });

  const overridden = new bindings.Button();
  checkProps({
    name: "a record of resources is a ResourceDictionary (Button.resources)",
    component: "Button",
    control: overridden,
    props: {
      resources: {
        "--button-background": "#336699",
        "--button-padding": CUSTOM_PADDING,
        "--is-compact": true
      }
    },
    verify() {
      const dictionary = themeDictionary(overridden.resources);
      assert.ok(dictionary.hasKey(boxed("ButtonBackground")), "ButtonBackground is not in the theme dictionary");
      assert.ok(dictionary.hasKey(boxed("ButtonPadding")), "ButtonPadding is not in the theme dictionary");
      assert.ok(overridden.resources.hasKey(boxed("IsCompact")), "the boolean is not in the dictionary");
    }
  });

  const sheet = translateStyleSheet({
    file: "mount.svelte",
    css: ROW_SHEET,
    resources: loadWinuiCatalogue()
  });
  assert.deepEqual(sheet.diagnostics, []);
  registerStyleSheet(sheet.sheet);
  const styled = new bindings.ListView();
  checkProps({
    name: "CSS class names make the Style of the prop (ListView.itemContainerStyle)",
    component: "ListView",
    control: styled,
    props: {
      itemContainerStyle: "row"
    },
    verify() {
      const style = styled.itemContainerStyle;
      assert.ok(style.targetType.name.endsWith("ListViewItem"), `the Style targets ${style.targetType.name}`);
      assert.ok(style.setters.size >= ROW_SETTERS, "the Style holds fewer setters than the class declares");
    }
  });

  const dialog = new bindings.ContentDialog();
  checkProps({
    name: "CSS class names make the Style of a prop that styles a Button (ContentDialog.closeButtonStyle)",
    component: "ContentDialog",
    control: dialog,
    props: {
      closeButtonStyle: "row"
    },
    verify() {
      assert.ok(dialog.closeButtonStyle.targetType.name.endsWith("Button"), "the Style does not target Button");
    }
  });

  const stated = new bindings.Button();
  checkProps({
    name: "goToState moves a control to a state its template defines",
    component: "Button",
    control: stated,
    props: {
      template: STATE_TEMPLATE
    },
    verify() {
      assert.ok(stated.applyTemplate(), "the control did not apply the template");
      assert.equal(
        goToState({
          control: stated,
          name: "Pressed"
        }), true, "the state the template defines was not entered"
      );
      assert.equal(
        goToState({
          control: stated,
          name: "NoSuchState",
          useTransitions: false
        }), false, "a state the template lacks was entered"
      );
    }
  });
}
