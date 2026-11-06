package dev.winui.svelte

internal sealed interface InlineVisual {
  data class Gradient(
    val stops: List<GradientStop>
  ) : InlineVisual

  data class Curve(
    val samples: List<Double>
  ) : InlineVisual
}

internal data class InlineAt(
  val offset: Int,
  val visual: InlineVisual
)

internal data class HintAt(
  val offset: Int,
  val label: String
)

internal data class CssPreview(
  val feature: PreviewFeature,
  val start: Int,
  val end: Int,
  val html: String,
  val inline: InlineAt? = null,
  val hint: HintAt? = null
)
