// The clipboard's HTML format (CF_HTML): a header of byte offsets, then the
// document with the fragment between two comments. WinUI hands and takes
// that text whole; the web's `text/html` is the fragment alone.
const START_FRAGMENT = "<!--StartFragment-->";
const END_FRAGMENT = "<!--EndFragment-->";
const OFFSET_DIGITS = 10;
const PREFIX = "<html><body>\r\n";
const SUFFIX = "\r\n</body></html>";

/**
 * The fragment of a CF_HTML text.
 *
 * @param htmlFormat - What `DataPackageView.getHtmlFormatAsync` gave.
 * @returns The HTML between the fragment comments; the text itself when it has none.
 */
export function fragmentOfHtmlFormat(htmlFormat: string) {
  const start = htmlFormat.indexOf(START_FRAGMENT);
  const end = htmlFormat.indexOf(END_FRAGMENT);
  const isFragmentMarked = start >= 0 && end > start;
  if (!isFragmentMarked) {
    return htmlFormat;
  }

  return htmlFormat.slice(start + START_FRAGMENT.length, end);
}

function offset(value: number) {
  return String(value).padStart(OFFSET_DIGITS, "0");
}

interface Offsets {
  startHtml: number;
  endHtml: number;
  startFragment: number;
  endFragment: number;
}

function header(offsets: Offsets) {
  return [
    "Version:0.9",
    `StartHTML:${offset(offsets.startHtml)}`,
    `EndHTML:${offset(offsets.endHtml)}`,
    `StartFragment:${offset(offsets.startFragment)}`,
    `EndFragment:${offset(offsets.endFragment)}`,
    ""
  ].join("\r\n");
}

/**
 * A CF_HTML text for a fragment, as `DataPackage.setHtmlFormat` takes it.
 *
 * @param fragment - The HTML to carry.
 * @returns The header, the document and the fragment between its comments.
 */
export function htmlFormatOf(fragment: string) {
  const body = `${PREFIX}${START_FRAGMENT}${fragment}${END_FRAGMENT}${SUFFIX}`;
  const headerLength = Buffer.byteLength(
    header({
      startHtml: 0,
      endHtml: 0,
      startFragment: 0,
      endFragment: 0
    })
  );
  const startFragment = headerLength + Buffer.byteLength(PREFIX + START_FRAGMENT);
  return header({
    startHtml: headerLength,
    endHtml: headerLength + Buffer.byteLength(body),
    startFragment,
    endFragment: startFragment + Buffer.byteLength(fragment)
  }) + body;
}
