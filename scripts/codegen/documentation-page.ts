import { memberText, plainText } from "./documentation.ts";

// A page of Microsoft's published reference (one Markdown file for each type
// and member in MicrosoftDocs/winapps-winrt-api) as the text a JSDoc comment
// takes: the description, and for a property its value or for a method its
// return, joined as memberText joins a summary and a returns. Build tooling
// only; fetch-documentation.ts is the one caller.

const SECTION_PATTERN = /^## -(\S+)[ \t]*$/gm;
const LINK_PATTERN = /\[([^\]]+)\]\([^)]*\)/g;
const CROSS_REFERENCE_PATTERN = /<xref:([^>?]+)(?:\?[^>]*)?>/g;
const PARAGRAPH_BREAK_PATTERN = /\n[ \t]*\n/;
const DESCRIPTION = "description";
const PROPERTY_VALUE = "property-value";
const RETURNS = "returns";

function sectionsOf(markdown: string) {
  const sections = new Map<string, string>();
  const headings = [...markdown.matchAll(SECTION_PATTERN)];
  for (const [i, heading] of headings.entries()) {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[i + 1]?.index ?? markdown.length;
    sections.set(heading[1] ?? "", markdown.slice(start, end).trim());
  }

  return sections;
}

function firstParagraph(markdown: string | undefined) {
  const paragraph = markdown?.split(PARAGRAPH_BREAK_PATTERN)[0] ?? "";
  return plainText(
    paragraph
      .replace(LINK_PATTERN, (_match, label: string) => label)
      .replace(CROSS_REFERENCE_PATTERN, (_match, reference: string) => reference.slice(reference.lastIndexOf(".") + 1))
  );
}

/**
 * The text of one reference page: its description, and for a property the
 * value it holds or for a method what it returns, when that adds to the
 * description. Empty where the page has no description.
 */
export function pageText(markdown: string) {
  const sections = sectionsOf(markdown);
  const summary = firstParagraph(sections.get(DESCRIPTION));
  const returns = firstParagraph(sections.get(PROPERTY_VALUE) ?? sections.get(RETURNS));
  return summary === "" ? "" : memberText({
    summary,
    returns: returns === "" ? null : returns
  });
}
