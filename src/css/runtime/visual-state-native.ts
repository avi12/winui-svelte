import type { StateFiller } from "./visual-states.ts";
import {
  Application,
  Brush,
  Control,
  DiscreteObjectKeyFrame,
  FrameworkElement,
  ObjectAnimationUsingKeyFrames,
  projectAs,
  PropertyValue,
  Storyboard,
  VisualStateManager,
  VisualTreeHelper,
  XamlReader
} from "#src/components/generated/bindings.js";
import type { Timeline, VisualState } from "#src/components/generated/bindings.js";
import { XAML_NAMESPACES } from "#src/css/translate/cascade.js";

const TAG_NAME = /^<\w+/u;
const THEME_RESOURCE = /^\{ThemeResource (\w+)\}$/u;

// The Brush a rule's value is: a theme brush by its key, a color, or a brush
// element (a gradient).
function brushOf(source: string) {
  const key = THEME_RESOURCE.exec(source)?.[1];
  const isThemeBrush = key !== undefined;
  if (isThemeBrush) {
    const boxedKey = PropertyValue.createString(key);
    return projectAs(Application.current.resources.lookup(boxedKey), Brush);
  }

  const isElement = source.startsWith("<");
  const markup = isElement ? source : `<SolidColorBrush Color="${source}"/>`;
  return projectAs(XamlReader.load(markup.replace(TAG_NAME, `$& ${XAML_NAMESPACES}`)), Brush);
}

interface Vector<Item> {
  readonly size: number;
  getAt(index: number): Item;
}

function itemsOf<Item>(vector: Vector<Item> | null) {
  const isMissing = vector === null;
  if (isMissing) {
    return [];
  }

  return Array.from({ length: vector.size }, (_, i) => vector.getAt(i));
}

// An animation that holds the brush for as long as its state does.
function brushAnimation({ element, property, brush }: {
  element: FrameworkElement;
  property: string;
  brush: Brush;
}) {
  const animation = projectAs(
    XamlReader.load(`<ObjectAnimationUsingKeyFrames ${XAML_NAMESPACES} Storyboard.TargetProperty="${property}"><DiscreteObjectKeyFrame KeyTime="0:0:0"/></ObjectAnimationUsingKeyFrames>`),
    ObjectAnimationUsingKeyFrames
  );
  Storyboard.setTarget(animation, element);
  const [frame] = itemsOf(animation.keyFrames);
  Object.assign(projectAs(frame, DiscreteObjectKeyFrame), { value: brush });
  return animation;
}

// Puts the animation in a state's storyboard in place of the template's own
// animation of that property; returns what puts them back.
function replaceAnimation({ children, part, property, animation }: {
  children: VisualState["storyboard"]["children"];
  part: string;
  property: string;
  animation: Timeline;
}) {
  function isReplaced(child: Timeline) {
    return Storyboard.getTargetName(child) === part && Storyboard.getTargetProperty(child) === property;
  }

  const replaced = itemsOf(children).filter(isReplaced);
  for (const child of replaced) {
    children.removeAt(children.indexOf(child));
  }

  children.append(animation);
  return () => {
    const position = children.indexOf(animation);
    const isAdded = position >= 0;
    if (isAdded) {
      children.removeAt(position);
    }

    for (const child of replaced) {
      children.append(child);
    }
  };
}

/**
 * Makes the states of a template draw the rules' brushes. The template's own
 * states animate the brushes of its parts (a Button's PointerOver animates its
 * ContentPresenter's Background), which a Style on the control and a Setter in
 * the state both lose to; so the brushes join those states as animations of the
 * same properties, in place of the template's.
 */
export function fillStates({ native, control, part, states }: Parameters<StateFiller>[0]) {
  const undos: (() => void)[] = [];
  function attach() {
    for (const undo of undos.splice(0)) {
      undo();
    }

    const templated = projectAs(control, Control);
    const hasChild = VisualTreeHelper.getChildrenCount(templated) > 0;
    if (!hasChild) {
      templated.applyTemplate();
    }

    const root = projectAs(VisualTreeHelper.getChild(templated, 0), FrameworkElement);
    const element = projectAs(root.findName(part), FrameworkElement);
    const groups = itemsOf(VisualStateManager.getVisualStateGroups(root));
    const defined = groups.flatMap(group => itemsOf(group.states));
    for (const { state, brushes } of states) {
      const children = defined.find(candidate => candidate.name === state)?.storyboard.children;
      const isStateMissing = children === undefined;
      if (isStateMissing) {
        throw new Error(`the template has no ${state} visual state to animate`);
      }

      for (const { property, source } of brushes) {
        undos.push(
          replaceAnimation({
            children,
            part,
            property,
            animation: brushAnimation({
              element,
              property,
              brush: brushOf(source)
            })
          })
        );
      }
    }
  }

  const isLoaded = native.read({
    control,
    property: "isLoaded"
  }) === true;
  if (isLoaded) {
    attach();
  }

  const unsubscribe = isLoaded ? null : native.subscribe(control, "Loaded", attach);
  return () => {
    unsubscribe?.();
    for (const undo of undos.splice(0)) {
      undo();
    }
  };
}
