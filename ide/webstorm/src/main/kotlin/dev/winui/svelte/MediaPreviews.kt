package dev.winui.svelte

/** The answer of every `@media` condition of a file in the assumed environment. */
internal object MediaPreviews {
  fun media(
    text: String,
    environment: MediaEnvironment
  ) = CssDeclarations.mediaQueriesOf(text).map { query ->
    val answer = MediaConditions.evaluate(query.condition, environment)
    val lines =
      answer.parts.joinToString("") {
        "<li><code>${it.text}</code>: ${answerText(it.isMatching)} (${it.detail})</li>"
      }
    val motion =
      if (environment.isReducedMotion) {
        "reduced"
      } else {
        "not reduced"
      }
    val assumed = "${environment.theme.id} theme, motion $motion, ${environment.width} x ${environment.height} px"
    CssPreview(
      PreviewFeature.MEDIA,
      query.start,
      query.end,
      "<b>${answer.label}</b> in the assumed environment ($assumed)<ul>$lines</ul>",
      hint = HintAt(query.end, answer.label)
    )
  }

  private fun answerText(isMatching: Boolean?) =
    when (isMatching) {
      null -> "unknown"
      true -> "yes"
      false -> "no"
    }
}
