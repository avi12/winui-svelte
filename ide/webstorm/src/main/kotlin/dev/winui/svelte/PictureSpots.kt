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
  private val keyBefore = Regex("""([A-Za-z_$][\w$]*)\s*:\s*$""")
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
    if (!isPicture(text)) {
      return emptyList()
    }

    val from = start + leading
    return listOf(PictureSpot(TextRange(from, from + text.length), text, variantOf(attribute, names), start))
  }

  /** The pictures an attribute expression names: each string of it, the key before it saying which taskbar. */
  fun expression(
    attribute: String,
    expression: String,
    start: Int,
    names: PictureNames
  ) = stringLiteral
    .findAll(expression)
    .mapNotNull { literal ->
      val value = literal.groupValues[2]
      val before = keyBefore.find(expression.substring(0, literal.range.first))?.groupValues?.get(1)
      val key =
        when {
          before != null && before in names.variants -> before
          else -> attribute
        }
      val from = start + literal.range.first + 1
      if (isPicture(value)) {
        PictureSpot(TextRange(from, from + value.length), value, variantOf(key, names), start)
      } else {
        null
      }
    }.toList()

  /** The pictures written as `key: "..."` anywhere in a file, for a key the library types as a picture. */
  fun keys(
    text: String,
    names: PictureNames
  ) = keyLiteral
    .findAll(text)
    .mapNotNull { match ->
      val key = match.groupValues[1]
      val value = match.groupValues[3]
      if (key !in names.names || !isPicture(value)) {
        return@mapNotNull null
      }

      val from = match.range.last - value.length
      PictureSpot(
        TextRange(from, from + value.length),
        value,
        variantOf(key, names),
        enclosingBrace(text, match.range.first)
      )
    }.toList()

  /** The spots with a repeated start dropped, the first kept. */
  fun unique(spots: List<PictureSpot>) = spots.distinctBy { it.range.startOffset }

  private fun isPicture(value: String) = PicturePaths.targetOf(value, "/", "/").kind != PictureKind.NONE

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
