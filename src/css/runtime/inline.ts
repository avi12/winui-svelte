import { BlockKind, parseCss } from "#src/css/parse/parser.js";
import type { LowerOptions } from "#src/css/parse/reader.js";
import type { Expansion } from "#src/css/translate/property-kit.js";
import { expandDeclaration } from "#src/css/translate/shorthands.js";
import type { SourcePosition } from "#src/css/translate/types.js";

const INLINE_POSITION: SourcePosition = {
  line: 1,
  column: 1
};

/**
 * Reads the text of a `style` attribute (`padding: 8px; opacity: .5`):
 * declarations that belong to one element and beat every rule of the
 * stylesheet. Svelte merges `style:padding={value}` directives into this one
 * string before the renderer sees it. A syntax problem throws.
 */
export function parseInlineStyle({ cssText, options, extra = new Map() }: {
  cssText: string;
  options: LowerOptions;
  /** The shorthands of the groups an app opted into. */
  extra?: ReadonlyMap<string, Expansion>;
}) {
  const [block] = parseCss(`x{${cssText}}`);
  const isRuleBlock = block?.kind === BlockKind.RULE;
  if (!isRuleBlock) {
    return [];
  }

  return block.declarations.flatMap(declaration => expandDeclaration({
    declaration: {
      ...declaration,
      at: INLINE_POSITION
    },
    options,
    extra
  }));
}
