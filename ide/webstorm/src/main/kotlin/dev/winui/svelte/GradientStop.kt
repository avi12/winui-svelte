package dev.winui.svelte

import java.awt.Color

internal enum class GradientKind(
  val label: String
) {
  LINEAR("linear"),
  RADIAL("radial")
}

internal data class GradientStop(
  val color: Color,
  val position: Double
)

internal data class GradientPreview(
  val kind: GradientKind,
  val start: Int,
  val end: Int,
  val stops: List<GradientStop>
)
