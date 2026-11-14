package dev.winui.svelte

import com.intellij.openapi.util.TextRange

/** Which taskbar a picture is for: both, or the light or dark one of a pair. */
internal enum class PictureVariant { ANY, LIGHT, DARK }

/** The member names that hold a picture and, of those, the ones that are for one taskbar theme. */
internal data class PictureNames(
  val names: Set<String>,
  val variants: Map<String, PictureVariant>
)

internal data class PictureSpot(
  val range: TextRange,
  val value: String,
  val variant: PictureVariant,
  val group: Int
)

/** Finds the pictures written in a file; the same rules as `picture-spots.ts`, tested against the same spec. */
internal object PictureSpots {
  private val stringLiteral = Regex("""(["'`])([^"'`$]*)\1""")
  private val keyLiteral = Regex("""\b([A-Za-z_$][\w$]*)\s*:\s*(["'`])([^"'`$]*)\2""")
  private val keyUrl = Regex("""\b([A-Za-z_$][\w$]*)\s*:\s*new\s+URL\(\s*(["'`])([^"'`$]*)\2""")
  private val keyIdentifier =
    Regex("""\b([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)(?=\s*(?:[,})]|\.(?:href|pathname)\b|\r?\n|$))""")
  private val identifier = Regex("""[A-Za-z_$][\w$]*""")
  private val keyBefore = Regex("""([A-Za-z_$][\w$]*)\s*:\s*$""")
  private const val VALUE_GROUP = 3
  private const val OPENING = '{'
  private const val CLOSING = '}'

  /** The picture a plain attribute value names (`icon="tray.ico"`). */
  fun plain(
    attribute: String,
    value: String,
    start: Int,
    names: PictureNames
  ): List<PictureSpot> {
    val leading = value.length - value.trimStart().length
    val text = value.trim()
    if (!PicturePaths.isPicture(text)) {
      return emptyList()
    }

    val from = start + leading
    return listOf(PictureSpot(TextRange(from, from + text.length), text, variantOf(attribute, names), start))
  }

  /**
   * The pictures an attribute expression names: each string of it and each name the file binds to a picture, the key
   * before it saying which taskbar.
   */
  fun expression(
    attribute: String,
    expression: String,
    start: Int,
    names: PictureNames,
    bindings: Map<String, String> = emptyMap()
  ): List<PictureSpot> {
    fun spotAt(
      index: Int,
      length: Int,
      value: String,
      quoteWidth: Int
    ): PictureSpot {
      val before = keyBefore.find(expression.substring(0, index - quoteWidth))?.groupValues?.get(1)
      val key =
        when {
          before != null && before in names.variants -> before
          else -> attribute
        }
      return PictureSpot(
        TextRange(start + index, start + index + length),
        value,
        variantOf(key, names),
        start
      )
    }

    val strings =
      stringLiteral.findAll(expression).filter { PicturePaths.isPicture(it.groupValues[2]) }.map {
        spotAt(it.range.first + 1, it.groupValues[2].length, it.groupValues[2], 1)
      }
    val references =
      identifiersOf(expression).mapNotNull { match ->
        bindings[match.value]?.let { spotAt(match.range.first, match.value.length, it, 0) }
      }
    return (strings + references).sortedBy { it.range.startOffset }.toList()
  }

  /**
   * The pictures written as `key: ...` anywhere in a file, for a key the library types as a picture: the options and
   * items of a script. The value is a string, `new URL("./x.png", import.meta.url)`, or a name the file binds to a
   * picture (`icon: logo`, `icon: url.href`).
   */
  fun keys(
    text: String,
    names: PictureNames,
    bindings: Map<String, String> = emptyMap()
  ): List<PictureSpot> {
    fun spotAt(
      match: MatchResult,
      value: String,
      range: IntRange
    ) = PictureSpot(
      TextRange(range.first, range.last + 1),
      value,
      variantOf(match.groupValues[1], names),
      enclosingBrace(text, match.range.first)
    )

    val literals =
      (keyLiteral.findAll(text) + keyUrl.findAll(text)).mapNotNull { match ->
        val value = match.groupValues[VALUE_GROUP]
        val from = match.range.last - value.length
        val isWanted = match.groupValues[1] in names.names && PicturePaths.isPicture(value)
        spotAt(match, value, from until from + value.length).takeIf { isWanted }
      }
    val references =
      keyIdentifier.findAll(text).mapNotNull { match ->
        val name = match.groupValues[2]
        val value = bindings[name]
        val from = match.range.last + 1 - name.length
        val isWanted = match.groupValues[1] in names.names && value != null
        value?.let { spotAt(match, it, from until from + name.length) }?.takeIf { isWanted }
      }
    return (literals + references).sortedBy { it.range.startOffset }.toList()
  }

  /** The spots with a repeated start dropped, the first kept. */
  fun unique(spots: List<PictureSpot>) = spots.distinctBy { it.range.startOffset }

  // The names of an expression that are not inside a string, a property (a.logo), a call (logo()) or an object key.
  private fun identifiersOf(expression: String): List<MatchResult> {
    val masked = stringLiteral.replace(expression) { " ".repeat(it.value.length) }
    return identifier
      .findAll(masked)
      .filter { match ->
        val before = masked.substring(0, match.range.first).trimEnd()
        val after = masked.substring(match.range.last + 1).trimStart()
        val isMember = match.range.first > 0 && masked[match.range.first - 1] == '.'
        val isCall = after.startsWith("(")
        val isKey = after.startsWith(":") && (before.endsWith("{") || before.endsWith(","))
        !isMember && !isCall && !isKey
      }.toList()
  }

  private fun variantOf(
    key: String,
    names: PictureNames
  ) = names.variants[key] ?: PictureVariant.ANY

  // The position of the nearest unclosed brace before the offset: the two pictures of a pair share it.
  private fun enclosingBrace(
    text: String,
    offset: Int
  ): Int {
    var depth = 0
    for (i in offset - 1 downTo 0) {
      val char = text[i]
      if (char == CLOSING) {
        depth++
      }

      val isOwnBrace = char == OPENING && depth == 0
      if (isOwnBrace) {
        return i
      }

      if (char == OPENING) {
        depth--
      }
    }

    return -1
  }
}
