import type {
  AutoSuggestBoxComponentProps,
  ButtonComponentProps,
  ContentDialogComponentProps,
  DatePickerComponentProps,
  DoubleAnimationComponentProps,
  PathComponentProps,
  PolygonComponentProps,
  RectangleComponentProps,
  TextBlockComponentProps,
  TextBoxComponentProps
} from "#src/components/index.js";

// Never run: `pnpm check` (tsc) reads it. Each value prop is given a value it
// must refuse, under an `@ts-expect-error` that fails the check if the wrong
// value were accepted. test/Values.fixture.svelte writes the forms it takes.
export const refused: {
  duration: DoubleAnimationComponentProps;
  repeatBehavior: DoubleAnimationComponentProps;
  fontWeight: TextBlockComponentProps;
  date: DatePickerComponentProps;
  points: PolygonComponentProps;
  strokeDashArray: RectangleComponentProps;
  data: PathComponentProps;
  itemsSource: AutoSuggestBoxComponentProps;
  inputScope: TextBoxComponentProps;
  template: ButtonComponentProps;
  contentTemplate: ButtonComponentProps;
  resources: ButtonComponentProps;
  resourceValue: ButtonComponentProps;
  closeButtonStyle: ContentDialogComponentProps;
} = {
  duration: {
    // @ts-expect-error a boolean is no duration
    duration: true
  },
  repeatBehavior: {
    repeatBehavior: {
      // @ts-expect-error an object that is not WinUI's own repeat behavior is none
      times: 3
    }
  },
  fontWeight: {
    // @ts-expect-error "heavy" is no name WinUI's FontWeights gives
    fontWeight: "heavy"
  },
  date: {
    // @ts-expect-error a boolean is no date
    date: true
  },
  points: {
    // @ts-expect-error a number is no list of points
    points: 42
  },
  strokeDashArray: {
    // @ts-expect-error a boolean is no list of numbers
    strokeDashArray: true
  },
  data: {
    // @ts-expect-error a number is no path data
    data: 42
  },
  itemsSource: {
    // @ts-expect-error a number is no collection
    itemsSource: 42
  },
  inputScope: {
    // @ts-expect-error "Nope" is no input scope name
    inputScope: "Nope"
  },
  template: {
    // @ts-expect-error a number is no control template
    template: 42
  },
  contentTemplate: {
    // @ts-expect-error a boolean is no data template
    contentTemplate: true
  },
  resources: {
    // @ts-expect-error a number is no record of resources
    resources: 42
  },
  resourceValue: {
    resources: {
      // @ts-expect-error a resource is not left undefined
      ButtonBackground: undefined
    }
  },
  closeButtonStyle: {
    // @ts-expect-error a number is neither class names nor a Style
    closeButtonStyle: 42
  }
};
