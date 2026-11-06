import { DeclarationSource } from "./css-scan.ts";
import type { CssDeclaration } from "./css-scan.ts";

const MEDIA = "@media";

/**
 * What a CSS declaration becomes in WinUI: the properties it sets and the place it applies, or why it has no
 * meaning there and what to write; undefined for a declaration the translation does not know at all (a prop or an
 * app's own custom property).
 */
export function declarationInfo({ declaration, unsupported, targets, isHandled }: {
  declaration: CssDeclaration;
  unsupported: ReadonlyMap<string, string>;
  targets: ReadonlyMap<string, string[]>;
  isHandled: (property: string) => boolean;
}) {
  const { property, source, selector, media } = declaration;
  const isProp = source === DeclarationSource.ATTRIBUTE;
  if (isProp) {
    return undefined;
  }

  const reason = unsupported.get(property);
  const hasReason = reason !== undefined;
  if (hasReason) {
    return {
      isSupported: false,
      property,
      reason,
      targets: [],
      scope: ""
    };
  }

  const known = targets.get(property) ?? [];
  const isKnown = known.length > 0 || isHandled(property);
  if (!isKnown) {
    return undefined;
  }

  const where = source === DeclarationSource.RULE
    ? `the rule \`${selector}\` is written against the component's markup, scoped by the component's own class`
    : "a style written on the tag applies to this element only";
  return {
    isSupported: true,
    property,
    reason: "",
    targets: known,
    scope: media.length > 0 ? `${where}, inside ${MEDIA} ${media.join(" and ")}` : where
  };
}
