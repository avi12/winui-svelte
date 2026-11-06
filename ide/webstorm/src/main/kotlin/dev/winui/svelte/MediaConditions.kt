package dev.winui.svelte

internal enum class Theme(
  val id: String
) {
  LIGHT("light"),
  DARK("dark");

  companion object {
    fun named(id: String) = entries.firstOrNull { it.id == id } ?: DARK
  }
}

internal data class MediaEnvironment(
  val theme: Theme,
  val isReducedMotion: Boolean,
  val width: Int,
  val height: Int
)

internal data class MediaPart(
  val text: String,
  val isMatching: Boolean?,
  val detail: String
)

internal data class MediaAnswer(
  val isMatching: Boolean?,
  val parts: List<MediaPart>
) {
  val label
    get() =
      when (isMatching) {
        null -> "now: unknown"
        true -> "now: yes"
        false -> "now: no"
      }
}

private class Comparison(
  val name: String,
  val operator: String,
  val value: Double?
)

/**
 * Whether the condition of an `@media` rule holds in an assumed environment (never the OS), part by part: the
 * `prefers-color-scheme` and `prefers-reduced-motion` features, `width` and `height` as `min-` and `max-` features,
 * as `(width >= 600px)` ranges and as `(400px <= width <= 800px)` chains, and the media types. Queries joined by a
 * comma hold when any holds; a part it does not know leaves the answer unknown.
 */
internal object MediaConditions {
  private val feature = Regex("""^\(\s*(?<name>[a-z-]+)\s*(?::\s*(?<value>[^)]+?))?\s*\)$""", RegexOption.IGNORE_CASE)
  private val range =
    Regex(
      """^\(\s*(?<left>[^<>=\s]+)\s*(?<first><=|>=|<|>|=)\s*(?<middle>[^<>=\s]+)\s*""" +
        """(?:(?<second><=|>=|<|>)\s*(?<right>[^<>=\s]+)\s*)?\)$"""
    )
  private val length = Regex("""^(-?\d*\.?\d+)px$""", RegexOption.IGNORE_CASE)
  private val limit = Regex("""^(?<limit>min|max)-(?<name>width|height)$""")
  private val negation = Regex("""^not\s""", RegexOption.IGNORE_CASE)
  private val modifier = Regex("""^(?:not|only)\s+""", RegexOption.IGNORE_CASE)
  private val conjunction = Regex("""\s+and\s+""", RegexOption.IGNORE_CASE)
  private val sizes = setOf("width", "height")
  private val mediaTypes = setOf("all", "screen", "print")
  private val flipped = mapOf("<" to ">", "<=" to ">=", ">" to "<", ">=" to "<=", "=" to "=")

  fun evaluate(
    condition: String,
    environment: MediaEnvironment
  ): MediaAnswer {
    val results = CssSplit.commas(condition).map { queryResult(it, environment) }
    val isAny = results.any { it.first == true }
    val isUnknown = results.any { it.first == null }
    val answer =
      when {
        isAny -> true
        isUnknown -> null
        else -> false
      }
    return MediaAnswer(answer, results.flatMap { it.second })
  }

  private fun lengthOf(word: String) =
    length
      .matchEntire(word)
      ?.groupValues
      ?.get(1)
      ?.toDouble()

  private fun holds(
    actual: Double,
    operator: String,
    value: Double
  ) = when (operator) {
    "<" -> actual < value
    "<=" -> actual <= value
    ">" -> actual > value
    ">=" -> actual >= value
    else -> actual == value
  }

  private fun sizeOf(
    name: String,
    environment: MediaEnvironment
  ) = (
    if (name == "width") {
      environment.width
    } else {
      environment.height
    }
  ).toDouble()

  private fun rangeComparisons(text: String): List<Comparison> {
    val groups = range.matchEntire(text)?.groups ?: return emptyList()
    val left = groups["left"]?.value.orEmpty()
    val first = groups["first"]?.value.orEmpty()
    val middle = groups["middle"]?.value.orEmpty()
    if (left in sizes) {
      return listOf(Comparison(left, first, lengthOf(middle)))
    }

    val second = groups["second"]?.value
    val chain =
      if (second ==
        null
      ) {
        emptyList()
      } else {
        listOf(Comparison(middle, second, lengthOf(groups["right"]?.value.orEmpty())))
      }
    return listOf(Comparison(middle, flipped[first] ?: first, lengthOf(left))) + chain
  }

  private fun featureComparisons(text: String): List<Comparison> {
    val groups = feature.matchEntire(text)?.groups
    val name =
      groups
        ?.get("name")
        ?.value
        .orEmpty()
        .lowercase()
    val value =
      lengthOf(
        groups
          ?.get("value")
          ?.value
          .orEmpty()
          .trim()
      )
    val bound = limit.matchEntire(name)?.groups
    if (bound != null) {
      return listOf(
        Comparison(
          bound["name"]?.value.orEmpty(),
          if (bound["limit"]?.value ==
            "min"
          ) {
            ">="
          } else {
            "<="
          },
          value
        )
      )
    }

    return if (name in sizes) {
      listOf(Comparison(name, "=", value))
    } else {
      emptyList()
    }
  }

  private fun sizePart(
    text: String,
    comparisons: List<Comparison>,
    environment: MediaEnvironment
  ): MediaPart {
    val known = comparisons.filter { it.value != null }
    val isReadable = known.size == comparisons.size
    val isMatching =
      if (isReadable) {
        known.all { holds(sizeOf(it.name, environment), it.operator, it.value ?: Double.NaN) }
      } else {
        null
      }
    return MediaPart(text, isMatching, known.joinToString(", ") { "${it.name} is ${sizeText(it.name, environment)}px" })
  }

  private fun sizeText(
    name: String,
    environment: MediaEnvironment
  ) = if (name == "width") {
    environment.width
  } else {
    environment.height
  }

  private fun partOf(
    text: String,
    environment: MediaEnvironment
  ): MediaPart {
    val groups = feature.matchEntire(text)?.groups
    val name = groups?.get("name")?.value?.lowercase()
    val value =
      groups
        ?.get("value")
        ?.value
        ?.trim()
        ?.lowercase()
    if (name == "prefers-color-scheme") {
      return MediaPart(text, value == environment.theme.id, "the theme is ${environment.theme.id}")
    }

    if (name == "prefers-reduced-motion") {
      val state =
        if (environment.isReducedMotion) {
          "on"
        } else {
          "off"
        }
      return MediaPart(text, (value == "reduce") == environment.isReducedMotion, "reduced motion is $state")
    }

    val comparisons = rangeComparisons(text) + featureComparisons(text)
    if (comparisons.isNotEmpty()) {
      return sizePart(text, comparisons, environment)
    }

    val type = text.lowercase()
    val isType = type in mediaTypes
    return when {
      isType -> MediaPart(text, type != "print", "an app is a screen")
      else -> MediaPart(text, null, "not evaluated")
    }
  }

  private fun queryResult(
    query: String,
    environment: MediaEnvironment
  ): Pair<Boolean?, List<MediaPart>> {
    val trimmed = query.trim()
    val isNegated = negation.containsMatchIn(trimmed)
    val parts = trimmed.replace(modifier, "").split(conjunction).map { partOf(it.trim(), environment) }
    val isUnknown = parts.any { it.isMatching == null }
    val isAll = parts.all { it.isMatching == true }
    return (
      if (isUnknown) {
        null
      } else {
        isAll != isNegated
      }
    ) to parts
  }
}
