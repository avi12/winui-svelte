import { boxOf, isTrackProperty, tracksOf } from "./css-box.ts";
import { contrastOfGroup } from "./css-contrast.ts";
import { declarationInfo } from "./css-declaration-info.ts";
import { easingOf, isEasingProperty, keySplineOf, timingsOf } from "./css-easing.ts";
import type { NamedEasing } from "./css-easing.ts";
import { brushGradientsOf, gradientsOf } from "./css-gradient.ts";
import type { GradientPreview } from "./css-gradient.ts";
import { evaluateMedia, mediaLabel } from "./css-media.ts";
import type { MediaEnvironment } from "./css-media.ts";
import {
  boxSvg,
  contrastSampleSvg,
  curveBigSvg,
  curveInlineSvg,
  gradientBarSvg,
  gradientInlineSvg,
  ladderSvg,
  materialSvg,
  timelineSvg,
  tracksSvg
} from "./css-preview-svg.ts";
import { cssDeclarationsOf, mediaQueriesOf } from "./css-scan.ts";
import type { CssDeclaration } from "./css-scan.ts";
import { isShadowProperty, materialOf, nearestStep, shadowDepthOf } from "./css-shadow.ts";
import type { Material, ShadowDepth } from "./css-shadow.ts";
import { imageOf } from "./preview.ts";

export const PreviewFeature = {
  GRADIENT: "gradient",
  CONTRAST: "contrast",
  EASING: "easing",
  BOX: "box",
  DECLARATION: "declaration",
  MEDIA: "media",
  SHADOW: "shadow"
} as const;
export type PreviewFeature = (typeof PreviewFeature)[keyof typeof PreviewFeature];

export interface CssPreview {
  feature: PreviewFeature;
  start: number;
  end: number;
  markdown: string;
  inline?: {
    offset: number;
    svg: string;
  };
  hint?: {
    offset: number;
    label: string;
  };
}

export interface PreviewTables {
  attributeProperties: ReadonlyMap<string, string>;
  easings: readonly NamedEasing[];
  shadowDepths: readonly ShadowDepth[];
  materials: readonly Material[];
  unsupported: ReadonlyMap<string, string>;
  targets: ReadonlyMap<string, string[]>;
  isHandled: (property: string) => boolean;
}

const PERCENT = 100;
const KEY_SPLINE = "key-spline";
const GRADIENT_PROPERTIES = new Set(["background", "background-image"]);

function percentText(position: number) {
  return `${Number((position * PERCENT).toFixed(1))}%`;
}

function gradientPreviews({ gradient, offset }: {
  gradient: GradientPreview;
  offset: number;
}) {
  const stops = gradient.stops.map(stop => `- \`${stop.color}\` at ${percentText(stop.position)}`).join("\n");
  return {
    feature: PreviewFeature.GRADIENT,
    start: offset + gradient.start,
    end: offset + gradient.end,
    inline: {
      offset: offset + gradient.start,
      svg: gradientInlineSvg(gradient)
    },
    markdown: `${imageOf({
      svg: gradientBarSvg(gradient),
      alt: `${gradient.kind} gradient`
    })}\n\n**${gradient.kind} gradient**, ${gradient.stops.length} stops, left to right\n\n${stops}`
  } satisfies CssPreview;
}

function gradientsFor({ text, declarations }: {
  text: string;
  declarations: CssDeclaration[];
}) {
  const fromCss = declarations.filter(declaration => GRADIENT_PROPERTIES.has(declaration.property) || declaration.source !== "rule")
    .flatMap(declaration => gradientsOf(declaration.value).map(gradient => gradientPreviews({
      gradient,
      offset: declaration.valueStart
    })));
  const fromBrushes = brushGradientsOf(text).map(gradient => gradientPreviews({
    gradient,
    offset: 0
  }));
  return [...fromCss, ...fromBrushes];
}

function contrastsFor(declarations: CssDeclaration[]) {
  const groups = Map.groupBy(declarations, declaration => declaration.group);
  return [...groups.values()].flatMap(group => {
    const contrast = contrastOfGroup(group);
    const hasNoContrast = contrast === undefined;
    if (hasNoContrast) {
      return [];
    }

    const markdown = `${imageOf({
      svg: contrastSampleSvg({
        foreground: contrast.foregroundHex,
        background: contrast.backgroundHex
      }),
      alt: contrast.label
    })}\n\n**${contrast.label}** between \`${contrast.foreground.value}\` and \`${contrast.background.value}\`\n\n`
      + "AA needs 4.5:1 (3:1 for large text), AAA needs 7:1";
    return [contrast.foreground, contrast.background].map(declaration => ({
      feature: PreviewFeature.CONTRAST,
      start: declaration.valueStart,
      end: declaration.valueEnd,
      markdown,
      ...declaration === contrast.foreground && {
        hint: {
          offset: declaration.valueEnd,
          label: contrast.label
        }
      }
    } satisfies CssPreview));
  });
}

function easingsFor({ declarations, tables }: {
  declarations: CssDeclaration[];
  tables: PreviewTables;
}) {
  return declarations.flatMap(declaration => {
    const { property, value, valueStart } = declaration;
    const isKeySpline = property === KEY_SPLINE;
    const samples = isKeySpline ? keySplineOf(value) : easingOf({
      value,
      named: tables.easings
    })?.samples;
    const isEasing = isKeySpline || isEasingProperty(property);
    const isNotEasing = samples === undefined || !isEasing;
    if (isNotEasing) {
      return [];
    }

    const timings = timingsOf({
      property,
      value,
      named: tables.easings
    });
    const timeline = timings.length > 0 ? `\n\n${imageOf({
      svg: timelineSvg(timings),
      alt: "timeline"
    })}\n\n${timings.map(timing => `${timing.name || "animation"}: ${timing.durationMs}ms after ${timing.delayMs}ms`).join("\n\n")}` : "";
    return [{
      feature: PreviewFeature.EASING,
      start: valueStart,
      end: declaration.valueEnd,
      inline: {
        offset: valueStart,
        svg: curveInlineSvg(samples)
      },
      markdown: `${imageOf({
        svg: curveBigSvg(samples),
        alt: "easing curve"
      })}\n\n**easing** progress against time${timeline}`
    } satisfies CssPreview];
  });
}

function boxesFor(declarations: CssDeclaration[]) {
  return declarations.flatMap(declaration => {
    const { property, value } = declaration;
    const box = boxOf({
      property,
      value
    });
    const tracks = isTrackProperty(property) ? tracksOf(value) : undefined;
    const base = {
      feature: PreviewFeature.BOX,
      start: declaration.valueStart,
      end: declaration.valueEnd
    } as const;
    const hasBox = box !== undefined;
    if (hasBox) {
      const order = box.kind === "corners" ? "top left, top right, bottom right, bottom left" : "top, right, bottom, left";
      return [{
        ...base,
        markdown: `${imageOf({
          svg: boxSvg(box),
          alt: property
        })}\n\n**${property}** ${box.values.join(", ")} px (${order})`
      }];
    }

    return tracks === undefined ? [] : [{
      ...base,
      markdown: `${imageOf({
        svg: tracksSvg(tracks),
        alt: property
      })}\n\n**${property}** ${tracks.length} tracks, drawn in proportion`
    }];
  });
}

function declarationsHover({ declarations, tables }: {
  declarations: CssDeclaration[];
  tables: PreviewTables;
}) {
  return declarations.flatMap(declaration => {
    const info = declarationInfo({
      declaration,
      unsupported: tables.unsupported,
      targets: tables.targets,
      isHandled: tables.isHandled
    });
    const hasNoInfo = info === undefined;
    if (hasNoInfo) {
      return [];
    }

    const becomes = info.targets.length > 0 ? `becomes ${info.targets.map(target => `\`${target}\``).join(", ")}` : "is translated to WinUI";
    return [{
      feature: PreviewFeature.DECLARATION,
      start: declaration.start,
      end: declaration.start + info.property.length,
      markdown: info.isSupported
        ? `**${info.property}** ${becomes}\n\n${info.scope}`
        : `**${info.property}** has no WinUI meaning\n\n${info.reason}`
    } satisfies CssPreview];
  });
}

function answerText(isMatching: boolean | undefined) {
  const isUnknown = isMatching === undefined;
  if (isUnknown) {
    return "unknown";
  }

  return isMatching ? "yes" : "no";
}

function mediaFor({ text, environment }: {
  text: string;
  environment: MediaEnvironment;
}) {
  return mediaQueriesOf(text).map(query => {
    const result = evaluateMedia({
      condition: query.condition,
      environment
    });
    const lines = result.parts.map(part => `- \`${part.text}\`: ${answerText(part.matches)} (${part.detail})`).join("\n");
    const assumed = `${environment.theme} theme, motion ${environment.isReducedMotion ? "reduced" : "not reduced"}, `
      + `${environment.width} x ${environment.height} px`;
    return {
      feature: PreviewFeature.MEDIA,
      start: query.start,
      end: query.end,
      hint: {
        offset: query.end,
        label: mediaLabel(result.matches)
      },
      markdown: `**${mediaLabel(result.matches)}** in the assumed environment (${assumed})\n\n${lines}`
    } satisfies CssPreview;
  });
}

function shadowsFor({ declarations, tables }: {
  declarations: CssDeclaration[];
  tables: PreviewTables;
}) {
  return declarations.flatMap(declaration => {
    const { property, value } = declaration;
    const base = {
      feature: PreviewFeature.SHADOW,
      start: declaration.valueStart,
      end: declaration.valueEnd
    } as const;
    const material = materialOf({
      property,
      value,
      materials: tables.materials
    });
    const hasMaterial = material !== undefined;
    if (hasMaterial) {
      return [{
        ...base,
        markdown: `${imageOf({
          svg: materialSvg(material),
          alt: material.name
        })}\n\n**${material.name}** light ${material.light}, dark ${material.dark}${material.isTranslucent ? ", translucent" : ""}`
      }];
    }

    const depth = isShadowProperty(property) ? shadowDepthOf({
      property,
      value
    }) : undefined;
    const nearest = depth === undefined ? -1 : nearestStep({
      depth,
      steps: tables.shadowDepths
    });
    const step = tables.shadowDepths[nearest];
    const isNoDepth = depth === undefined || step === undefined;
    if (isNoDepth) {
      return [];
    }

    return [{
      ...base,
      markdown: `${imageOf({
        svg: ladderSvg({
          steps: tables.shadowDepths,
          nearest
        }),
        alt: "shadow depths"
      })}\n\n**depth ${depth}**, nearest to ${step.use} (${step.depth})`
    }];
  });
}

/**
 * Every CSS and layout preview a Svelte file has, in text order: the gradient bar, the contrast ratio, the easing
 * curve and timeline, the box model and grid tracks, what a declaration becomes in WinUI, whether an `@media`
 * condition holds in the assumed environment, and the shadow depth or window material. `features` says which are on.
 */
export function cssPreviewsOf({ text, features, environment, tables }: {
  text: string;
  features: ReadonlySet<PreviewFeature>;
  environment: MediaEnvironment;
  tables: PreviewTables;
}) {
  const declarations = cssDeclarationsOf({
    text,
    attributeProperties: tables.attributeProperties
  });
  const all: CssPreview[] = [
    ...features.has(PreviewFeature.GRADIENT) ? gradientsFor({
      text,
      declarations
    }) : [],
    ...features.has(PreviewFeature.CONTRAST) ? contrastsFor(declarations) : [],
    ...features.has(PreviewFeature.EASING) ? easingsFor({
      declarations,
      tables
    }) : [],
    ...features.has(PreviewFeature.BOX) ? boxesFor(declarations) : [],
    ...features.has(PreviewFeature.DECLARATION) ? declarationsHover({
      declarations,
      tables
    }) : [],
    ...features.has(PreviewFeature.MEDIA) ? mediaFor({
      text,
      environment
    }) : [],
    ...features.has(PreviewFeature.SHADOW) ? shadowsFor({
      declarations,
      tables
    }) : []
  ];
  return all.toSorted((left, right) => left.start - right.start);
}
