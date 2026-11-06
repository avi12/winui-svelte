package dev.winui.svelte

internal object CssSplit {
  private const val OPEN = '('
  private const val CLOSE = ')'
  private val pixelPattern = Regex("""^(-?\d*\.?\d+)(px)?$""", RegexOption.IGNORE_CASE)

  /** The parts of a CSS value between commas, leaving alone every comma inside parentheses; each part is trimmed. */
  fun commas(text: String) = split(text) { it == ',' }.map { it.trim() }

  /** The words of a CSS value between whitespace, leaving alone every space inside parentheses. */
  fun words(text: String) = split(text) { it.isWhitespace() }.filter { it.isNotEmpty() }

  /** The index just after the parenthesis that closes the one at [open], or -1 when it never closes. */
  fun closingIndex(
    text: String,
    open: Int
  ): Int {
    var depth = 0
    for (i in open until text.length) {
      depth += depthChange(text[i])
      val isClosed = depth == 0
      if (isClosed) {
        return i + 1
      }
    }

    return -1
  }

  /** The pixels a native length is (`12px`, `12`, `0`), or null for any other unit: WinUI's units are pixels only. */
  fun pixelsOf(word: String) =
    pixelPattern
      .matchEntire(word.trim())
      ?.groupValues
      ?.get(1)
      ?.toDouble()

  private fun depthChange(char: Char) =
    when (char) {
      OPEN -> 1
      CLOSE -> -1
      else -> 0
    }

  private fun split(
    text: String,
    isSeparator: (Char) -> Boolean
  ): List<String> {
    val parts = mutableListOf<String>()
    val current = StringBuilder()
    var depth = 0
    for (char in text) {
      depth += depthChange(char)
      val isBoundary = depth == 0 && isSeparator(char)
      if (isBoundary) {
        parts.add(current.toString())
        current.clear()
        continue
      }

      current.append(char)
    }

    parts.add(current.toString())
    return parts
  }
}
