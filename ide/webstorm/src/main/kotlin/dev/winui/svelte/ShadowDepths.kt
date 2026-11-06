package dev.winui.svelte

import kotlin.math.abs
import kotlin.math.max

/** The depth a ThemeShadow gets from a value, placed on the ladder of depths WinUI uses, and a backdrop's material. */
internal object ShadowDepths {
  private const val ELEVATION = "-winui-elevation"
  private const val BOX_SHADOW = "box-shadow"
  private const val BACKDROP = "backdrop"
  private const val BLUR_INDEX = 2

  /** Whether the property sets a depth the ladder draws. */
  fun isShadowProperty(property: String) = property == ELEVATION || property == BOX_SHADOW

  /**
   * The depth a ThemeShadow gets from the value: `-winui-elevation` is the depth in pixels, and the first shadow of a
   * `box-shadow` is its blur radius, or its larger offset when it has no blur (src/css/translate/surface-properties.ts);
   * null when the value is neither.
   */
  fun depthOf(
    property: String,
    value: String
  ): Double? {
    if (property == ELEVATION) {
      return CssSplit.pixelsOf(value)
    }

    if (property != BOX_SHADOW) {
      return null
    }

    val first = CssSplit.commas(value).firstOrNull().orEmpty()
    val lengths = CssSplit.words(first).mapNotNull { CssSplit.pixelsOf(it) }
    val across = lengths.getOrNull(0) ?: return null
    val down = lengths.getOrNull(1) ?: return null
    val blur = lengths.getOrElse(BLUR_INDEX) { 0.0 }
    return if (blur > 0) {
      blur
    } else {
      max(abs(across), abs(down))
    }
  }

  /** The index of the step of the ladder a depth is closest to (the shallower one on a tie), or -1 for an empty ladder. */
  fun nearestStep(
    depth: Double,
    steps: List<ShadowDepth>
  ): Int {
    var nearest = -1
    var distance = Double.POSITIVE_INFINITY
    for ((i, step) in steps.withIndex()) {
      val gap = abs(step.depth - depth)
      val isCloser = gap < distance
      if (isCloser) {
        nearest = i
        distance = gap
      }
    }

    return nearest
  }

  /** The material a `backdrop` value names (`mica`, `acrylic`), or null for any other value. */
  fun materialOf(
    property: String,
    value: String,
    materials: List<WindowMaterial>
  ): WindowMaterial? {
    val name = value.trim().trim('"', '\'')
    return if (property == BACKDROP) {
      materials.firstOrNull { it.name == name }
    } else {
      null
    }
  }
}
