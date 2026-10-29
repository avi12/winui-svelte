import { emitLevel } from "./emit.ts";
import type { PropertyModel } from "./model.ts";
import { PropertyKind } from "./tables.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function property({ key, kind }: {
  key: string;
  kind: PropertyKind;
}) {
  return {
    winName: key,
    key,
    kind,
    enumType: null,
    isContent: false
  };
}

function pickerWith(properties: PropertyModel[]) {
  return {
    type: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "DatePicker"
    },
    tag: "date-picker",
    parent: null,
    isComponent: true,
    contentProperty: null,
    declaresContent: false,
    properties,
    events: [{
      winName: "DateChanged",
      key: "onDateChanged"
    }],
    attached: [],
    bindables: [{
      key: "date",
      winName: "Date",
      events: ["DateChanged"]
    }],
    observed: [],
    slots: [],
    holdsItems: false,
    registers: []
  };
}

const level = pickerWith([
  property({
    key: "date",
    kind: PropertyKind.DATE_TIME
  }),
  property({
    key: "selectedDate",
    kind: PropertyKind.NULLABLE_DATE_TIME
  }),
  property({
    key: "beginTime",
    kind: PropertyKind.NULLABLE_TIME_SPAN
  }),
  property({
    key: "duration",
    kind: PropertyKind.DURATION
  })
]);

test("a value prop is declared as its input type and written through its converter", () => {
  const text = emitLevel(level);
  assert.match(text, /date\?: DateInput \| undefined;/u);
  assert.match(text, /duration\?: DurationInput;/u);
  assert.match(text, /control\.date = dateTimeOf\(value\);/u);
  assert.match(text, /control\.duration = durationOf\(value\);/u);
});

test("a nullable value prop is written through its own converter", () => {
  const text = emitLevel(level);
  assert.match(text, /selectedDate\?: NullableDateInput;/u);
  assert.match(text, /beginTime\?: NullableTimeSpanInput;/u);
  assert.match(text, /control\.selectedDate = nullableDateTimeOf\(value\);/u);
});

test("a bindable value prop reads the control back as the app writes it", () => {
  const text = emitLevel(level);
  assert.match(text, /read: \(\) => dateInputOf\(control\.date\)/u);
});

test("the converters and their types are imported from convert", () => {
  const text = emitLevel(level);
  assert.match(text, /import \{[^}]*dateTimeOf[^}]*dateInputOf|import \{[^}]*dateInputOf[^}]*dateTimeOf/u);
  assert.match(text, /import type \{[^}]*DateInput[^}]*TimeSpanInput[^}]*\} from "\.\.\/\.\.\/convert\.ts"/u);
});

test("an items source takes an array and makes it a collection", () => {
  const text = emitLevel(
    pickerWith([
      property({
        key: "date",
        kind: PropertyKind.DATE_TIME
      }),
      property({
        key: "itemsSource",
        kind: PropertyKind.OBJECT
      }),
      property({
        key: "content",
        kind: PropertyKind.OBJECT
      })
    ])
  );
  assert.match(text, /itemsSource\?: CollectionInput;/u);
  assert.match(text, /control\.itemsSource = collectionOf\(value\);/u);
  assert.match(text, /content\?: ObjectInput;/u);
  assert.match(text, /control\.content = objectOf\(value\);/u);
});

test("a template prop takes XAML text or the template and is written through its converter", () => {
  const text = emitLevel(
    pickerWith([
      property({
        key: "date",
        kind: PropertyKind.DATE_TIME
      }),
      property({
        key: "template",
        kind: PropertyKind.CONTROL_TEMPLATE
      }),
      property({
        key: "headerTemplate",
        kind: PropertyKind.DATA_TEMPLATE
      }),
      property({
        key: "itemsPanel",
        kind: PropertyKind.ITEMS_PANEL_TEMPLATE
      })
    ])
  );
  assert.match(text, /template\?: ControlTemplateInput;/u);
  assert.match(text, /headerTemplate\?: DataTemplateInput;/u);
  assert.match(text, /itemsPanel\?: ItemsPanelTemplateInput;/u);
  assert.match(text, /control\.template = controlTemplateOf\(value\);/u);
  assert.match(text, /control\.headerTemplate = dataTemplateOf\(value\);/u);
  assert.match(text, /control\.itemsPanel = itemsPanelTemplateOf\(value\);/u);
});

test("a Style prop is converted with the control and its own name, which say what it styles", () => {
  const text = emitLevel(
    pickerWith([
      property({
        key: "date",
        kind: PropertyKind.DATE_TIME
      }),
      property({
        key: "itemContainerStyle",
        kind: PropertyKind.STYLE
      })
    ])
  );
  assert.match(text, /itemContainerStyle\?: StyleInput;/u);
  assert.match(
    text,
    /control\.itemContainerStyle = styleOf\(\{ input: value, owner: control, property: "itemContainerStyle" \}\);/u
  );
});

test("a resources prop takes a record or a ResourceDictionary", () => {
  const text = emitLevel(
    pickerWith([
      property({
        key: "date",
        kind: PropertyKind.DATE_TIME
      }),
      property({
        key: "resources",
        kind: PropertyKind.RESOURCE_DICTIONARY
      })
    ])
  );
  assert.match(text, /resources\?: ResourcesInput;/u);
  assert.match(text, /control\.resources = resourcesOf\(value\);/u);
});
