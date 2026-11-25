import { scanAttributes, scanExpressionAttributes } from "./markup-scan.ts";
import { pictureBindings } from "./picture-bindings.ts";
import { isPictureAttribute, pictureNames, WRAPPER_TYPE } from "./picture-data.ts";
import { loadPicture } from "./picture-load.ts";
import { pictureTables } from "./picture-spec.ts";
import { expressionSpots, keySpots, plainSpots, uniqueSpots, Variant } from "./picture-spots.ts";
import { isTypedProp } from "./typed-prop.ts";
import { isWinuiFile, projectRootOf } from "./winui-project.ts";

type Remote = Parameters<typeof loadPicture>[0]["remote"];

async function attributeSpots({ text, file, bindings }: {
  text: string;
  file: string;
  bindings: Map<string, string>;
}) {
  const names = pictureNames();
  function isPicture({ tag, attribute }: {
    tag: string;
    attribute: string;
  }) {
    return isTypedProp({
      isOwn: isPictureAttribute({
        tag,
        attribute
      }),
      inputType: WRAPPER_TYPE,
      tag,
      attribute,
      documentText: text,
      documentFile: file
    });
  }

  const plain = await Promise.all(
    scanAttributes(text).map(async found => {
      const isPictureProp = await isPicture(found);
      return isPictureProp ? plainSpots({
        attribute: found.attribute,
        value: found.value,
        start: found.valueStart,
        names
      }) : [];
    })
  );
  const expressions = await Promise.all(
    scanExpressionAttributes(text).map(async found => {
      const isPictureProp = await isPicture(found);
      return isPictureProp ? expressionSpots({
        attribute: found.attribute,
        expression: found.value,
        start: found.valueStart,
        names,
        bindings
      }) : [];
    })
  );
  return [...plain.flat(), ...expressions.flat()];
}

/**
 * Every picture a file of a project that depends on winui-svelte names (a prop typed as a picture, an option or an
 * object key), each loaded: the data to draw it with, or the reason there is none. A file of any other project
 * has none. With `isAttributesOnly` off, the keys of a script (a `.ts` or `.js` file) count too.
 */
export async function resolvedPictures({ text, file, isRemoteEnabled, remote, isMarkup }: {
  text: string;
  file: string;
  isRemoteEnabled: boolean;
  remote: Remote;
  isMarkup: boolean;
}) {
  const isWinui = await isWinuiFile(file);
  if (!isWinui) {
    return [];
  }

  const root = await projectRootOf(file);
  const bindings = pictureBindings(text);
  const attributes = isMarkup ? await attributeSpots({
    text,
    file,
    bindings
  }) : [];
  const spots = uniqueSpots([
    ...attributes,
    ...keySpots({
      text,
      names: pictureNames(),
      bindings
    })
  ]);
  return Promise.all(
    spots.map(async spot => ({
      spot,
      picture: await loadPicture({
        value: spot.value,
        file,
        root,
        isRemoteEnabled,
        remote
      })
    }))
  );
}

export type ResolvedPicture = Awaited<ReturnType<typeof resolvedPictures>>[number];

/**
 * The background a light or dark taskbar picture is drawn on; none for a picture that is for both.
 */
export function backgroundOf(variant: Variant) {
  return variant === Variant.ANY ? undefined : pictureTables.backgrounds[variant];
}

/**
 * The pictures a hover shows for one of them: itself, and when it is a light or dark taskbar picture, the partner
 * of the same object, each with the words that say which taskbar it is for.
 */
export function hoverGroup({ resolved, target }: {
  resolved: ResolvedPicture[];
  target: ResolvedPicture;
}) {
  const isPaired = target.spot.variant !== Variant.ANY;
  return resolved.filter(other => {
    const isPartner = other.spot.group === target.spot.group && other.spot.variant !== Variant.ANY;
    return other === target || isPaired && isPartner;
  }).map(entry => ({
    entry,
    theme: entry.spot.variant === Variant.ANY ? "" : ` (for the ${entry.spot.variant} taskbar)`
  }));
}
