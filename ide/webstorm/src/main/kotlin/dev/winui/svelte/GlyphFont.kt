package dev.winui.svelte

import java.awt.Font

internal object GlyphFont {
  private val families = listOf("Segoe Fluent Icons", "Segoe MDL2 Assets")
  private const val PROBE_SIZE = 1

  val family: String? by lazy {
    families.firstOrNull { Font(it, Font.PLAIN, PROBE_SIZE).family.equals(it, ignoreCase = true) }
  }

  @Volatile
  private var cached: Font? = null

  fun font(size: Float): Font? {
    val name = family ?: return null
    val last = cached
    if (last != null && last.size2D == size) {
      return last
    }

    return Font(name, Font.PLAIN, 1).deriveFont(size).also { cached = it }
  }
}
