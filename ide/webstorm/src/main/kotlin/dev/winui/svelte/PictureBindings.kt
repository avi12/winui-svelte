package dev.winui.svelte

/**
 * The names a file binds to a picture that is known without running it: a default import of an image
 * (`import logo from "./logo.png"`), and a `const` of a string or of `new URL("./x.png", import.meta.url)` that names
 * a picture. The value is the text as written, which resolves like any other picture value.
 */
internal object PictureBindings {
  private const val VALUE_GROUP = 3
  private val importDefault = Regex("""\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*(["'])([^"'\n]+)\2""")
  private val constant =
    Regex("""\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:new\s+URL\(\s*)?(["'`])([^"'`$\n]*)\2""")

  fun of(text: String): Map<String, String> {
    val bindings = mutableMapOf<String, String>()
    for (match in importDefault.findAll(text) + constant.findAll(text)) {
      val value = match.groupValues[VALUE_GROUP]
      if (PicturePaths.isPicture(value)) {
        bindings[match.groupValues[1]] = value
      }
    }

    return bindings
  }
}
