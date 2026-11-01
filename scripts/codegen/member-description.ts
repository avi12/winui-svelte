import { cssNoteOf } from "./css-names.ts";
import { inputDocumentationOf } from "./input-documentation.ts";

/**
 * The paragraphs that describe a prop or an event, in the order the editor
 * and the JSDoc show them: WinUI's text, what the prop accepts, the CSS
 * property that also sets it, and its type (left out where undefined).
 */
export function descriptionParagraphsOf({ text, kind, winName, inputType, displayType }: {
  text: string | undefined;
  kind?: string;
  winName?: string;
  inputType?: string | undefined;
  displayType?: string | undefined;
}) {
  const hasInputType = inputType !== undefined;
  const accepts = hasInputType ? inputDocumentationOf(inputType) : undefined;
  const isProperty = kind === "P" && winName !== undefined;
  const paragraphs = [
    text,
    accepts === undefined ? undefined : `Accepts ${accepts}`,
    isProperty ? cssNoteOf(winName) : undefined,
    displayType === undefined ? undefined : `Type: \`${displayType}\``
  ];
  return paragraphs.filter(paragraph => paragraph !== undefined);
}
