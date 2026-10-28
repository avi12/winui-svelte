<script lang="ts">
  // Never mounted: `pnpm check` (tsc and svelte-check) reads it. The markup
  // writes each value prop in the forms it takes; the script writes a value it
  // must refuse, under an `@ts-expect-error` that fails the check if the wrong
  // value were accepted (a markup comment cannot carry the directive).
  import type { DateInput } from "#src/components/convert.js";
  import type {
    AutoSuggestBoxComponentProps,
    DatePickerComponentProps,
    DoubleAnimationComponentProps,
    PathComponentProps,
    PolygonComponentProps,
    RectangleComponentProps,
    TextBlockComponentProps,
    TextBoxComponentProps
  } from "#src/components/index.js";
  import {
    AutoSuggestBox,
    DatePicker,
    DoubleAnimation,
    Path,
    Polygon,
    Rectangle,
    TextBlock,
    TextBox
  } from "#src/components/index.js";

  let date = $state<DateInput | undefined>(new Date());

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
    }
  };
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
