package dev.winui.svelte

import java.awt.GraphicsEnvironment

internal object FontFamilies {
  private val genericFamilies =
    setOf("serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "emoji", "math", "fangsong")

  private val installed: Set<String> by lazy {
    GraphicsEnvironment
      .getLocalGraphicsEnvironment()
      .availableFontFamilyNames
      .map { it.lowercase() }
      .toSet()
  }

  fun nameOf(lookupString: String) = lookupString.trim().trim('"', '\'')

  fun isInstalled(name: String) = name.lowercase() !in genericFamilies && name.lowercase() in installed
}
