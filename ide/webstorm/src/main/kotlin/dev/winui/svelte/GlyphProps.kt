package dev.winui.svelte

import com.intellij.psi.xml.XmlTag

internal object GlyphProps {
  private const val GLYPH_INPUT = "GlyphInput"

  fun isGlyphProp(
    tag: XmlTag,
    attribute: String
  ): Boolean {
    if (FluentGlyphs.isGlyphAttribute(tag.name, attribute)) {
      return true
    }

    val component = ComponentFile.of(tag) ?: return false
    return declaresAsGlyphInput(component.text, attribute)
  }

  fun declaresAsGlyphInput(
    source: String,
    prop: String
  ) = Regex("""\b${Regex.escape(prop)}\??\s*:\s*$GLYPH_INPUT\b""").containsMatchIn(source)
}
