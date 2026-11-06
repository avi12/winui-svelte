package dev.winui.svelte

internal enum class EasingKind(
  val id: String
) {
  BEZIER("bezier"),
  STEPS("steps")
}

internal data class NamedEasing(
  val name: String,
  val kind: EasingKind,
  val points: List<Double>,
  val count: Int,
  val jump: String
)

internal data class ShadowDepth(
  val depth: Int,
  val use: String
)

internal data class WindowMaterial(
  val name: String,
  val light: String,
  val dark: String,
  val isTranslucent: Boolean
)
