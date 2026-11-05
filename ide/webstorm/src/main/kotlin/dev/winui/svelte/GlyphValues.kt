package dev.winui.svelte

import com.intellij.psi.PsiFile
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlAttributeValue

internal object GlyphValues {
  fun isGlyphValue(
    value: XmlAttributeValue,
    file: PsiFile
  ): Boolean {
    val attribute = value.parent as? XmlAttribute ?: return false
    val tag = attribute.parent ?: return false
    val isGlyphProp = TypedProps.glyph.isProp(tag, attribute.name)
    return isGlyphProp && WinuiProjectService.of(file.project).isWinuiFile(file)
  }

  fun codePointOf(value: XmlAttributeValue): Int? {
    val text = value.value
    FluentGlyphs.codePoints[text]?.let { return it }
    val isSingleGlyph = text.isNotEmpty() && text.codePointCount(0, text.length) == 1
    if (!isSingleGlyph) {
      return null
    }

    return text.codePointAt(0).takeIf { it in FluentGlyphs.codePoints.values }
  }
}
