/**
 * Names a picture a prop or option draws: a path (relative to the file, to the project or absolute), an
 * `ms-appx:///` URI, a `data:` URI or an `http(s)` URL. `Extra` adds the other forms the prop takes (pixels, a
 * light and dark pair, WinUI's own image source).
 *
 * The editor add-ons preview the picture beside every prop, option or object key typed with this alias: type a new
 * picture-taking prop with it and the preview appears with no edit to the add-ons.
 */
export type PictureSource<Extra = never> = string | Extra;

/** One picture for each taskbar theme; `forLightTaskbar` has the dark glyph. */
export interface TaskbarPictures {
  /**
   * Shown while the taskbar is light (so a dark glyph).
   *
   * @taskbarTheme light
   */
  readonly forLightTaskbar: PictureSource;

  /**
   * Shown while the taskbar is dark (so a light glyph).
   *
   * @taskbarTheme dark
   */
  readonly forDarkTaskbar: PictureSource;
}
