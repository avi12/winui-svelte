package dev.winui.svelte

import com.intellij.lang.injection.InjectedLanguageManager
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlAttributeValue

internal data class GlyphSpot(
  val range: TextRange,
  val codePoint: Int
)

internal object GlyphValues {
  private val STRING_LITERAL = Regex("""(["'`])([^"'`\$]*)\1""")

  private const val QUOTES = "\"'`"

  /** The attribute value the position is in, also when it is inside the JavaScript of an expression. */
  fun valueAt(position: PsiElement): XmlAttributeValue? {
    val host = InjectedLanguageManager.getInstance(position.project).getInjectionHost(position)
    return PsiTreeUtil.getParentOfType(host ?: position, XmlAttributeValue::class.java, false)
  }

  /** Whether the position is a string of an expression, as opposed to the plain value of the attribute. */
  fun isInsideString(position: PsiElement): Boolean {
    val first = position.text.firstOrNull() ?: return false
    return first in QUOTES
  }

  fun isGlyphValue(
    value: XmlAttributeValue,
    file: PsiFile
  ): Boolean {
    val attribute = value.parent as? XmlAttribute ?: return false
    val tag = attribute.parent ?: return false
    val isGlyphProp = TypedProps.glyph.isProp(tag, attribute.name)
    return isGlyphProp && WinuiProjectService.of(file.project).isWinuiFile(file)
  }

  /** Every icon name in the value, as a range in the file: the value itself, or each string of an expression. */
  fun spotsOf(value: XmlAttributeValue): List<GlyphSpot> {
    val start = value.textRange.startOffset
    val isExpression = value.text.contains('{')
    if (!isExpression) {
      val codePoint = codePointOf(value.value) ?: return emptyList()
      val nameStart = start + value.text.indexOf(value.value)
      return listOf(GlyphSpot(TextRange.from(nameStart, value.value.length), codePoint))
    }

    return STRING_LITERAL
      .findAll(value.text)
      .mapNotNull { literal ->
        val name = literal.groups[2] ?: return@mapNotNull null
        val codePoint = codePointOf(name.value) ?: return@mapNotNull null
        GlyphSpot(TextRange.from(start + name.range.first, name.value.length), codePoint)
      }.toList()
  }

  private fun codePointOf(text: String): Int? {
    FluentGlyphs.codePoints[text]?.let { return it }
    val isSingleGlyph = text.isNotEmpty() && text.codePointCount(0, text.length) == 1
    if (!isSingleGlyph) {
      return null
    }

    return text.codePointAt(0).takeIf { it in FluentGlyphs.codePoints.values }
  }
}
