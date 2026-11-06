import { ShadowRole } from "#src/css/translate/shadow-mode.js";
import type { ShadowRole as ShadowRoleName } from "#src/css/translate/shadow-mode.js";
import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
import { ThemeShadow } from "#winui/microsoft/ui/xaml/media/ThemeShadow";

// The Receivers of a ThemeShadow are elements, which a Style cannot name. CSS
// names a group instead: the elements that cast into it (`-winui-shadow-cast-on`)
// and the ones that receive (`-winui-shadow-receiver`), and each caster is given
// a ThemeShadow whose Receivers are the group's receivers. Reading a Shadow back
// from an element hangs, so the caster's ThemeShadow is the one this module made,
// and it replaces the one the Style set.

interface ShadowGroup {
  casters: Map<FrameworkElement, ThemeShadow>;
  receivers: Set<FrameworkElement>;
}

const groups = new Map<string, ShadowGroup>();

function groupOf(name: string) {
  const known = groups.get(name);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const group: ShadowGroup = {
    casters: new Map(),
    receivers: new Set()
  };
  groups.set(name, group);
  return group;
}

function sync(group: ShadowGroup) {
  for (const shadow of group.casters.values()) {
    shadow.receivers.clear();
    for (const receiver of group.receivers) {
      shadow.receivers.append(receiver);
    }
  }
}

function castFrom({ group, element }: {
  group: ShadowGroup;
  element: FrameworkElement;
}) {
  const shadow = new ThemeShadow();
  group.casters.set(element, shadow);
  element.shadow = shadow;
  sync(group);
}

/**
 * Puts the element in the shadow group `name` as a caster or a receiver; a
 * caster gets a ThemeShadow whose Receivers are the group's receivers (a local
 * value, which wins over the Shadow a Style sets); returns what takes it out.
 */
export function joinShadowGroup({ element, name, role }: {
  element: FrameworkElement;
  name: string;
  role: ShadowRoleName;
}) {
  const group = groupOf(name);
  const isCaster = role === ShadowRole.CASTER;
  if (isCaster) {
    castFrom({
      group,
      element
    });
  } else {
    group.receivers.add(element);
    sync(group);
  }

  return () => {
    group.casters.get(element)?.receivers.clear();
    group.casters.delete(element);
    group.receivers.delete(element);
    sync(group);
  };
}
