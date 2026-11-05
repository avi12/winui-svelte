package dev.winui.svelte

import com.intellij.psi.PsiElement
import com.intellij.psi.css.CssDeclaration
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlAttributeValue

internal object FontFamilyContext {
  private const val FONT_FAMILY = "font-family"
  private const val STYLE_FONT_FAMILY = "style:font-family"
  private const val STYLE = "style"
  private val styleDeclaration = Regex("""(?:^|;)\s*font-family\s*:[^;]*$""", RegexOption.IGNORE_CASE)

  fun isFontFamily(
    position: PsiElement,
    caretOffset: Int
  ): Boolean {
    val declaration = PsiTreeUtil.getParentOfType(position, CssDeclaration::class.java)
    if (declaration != null) {
      return declaration.propertyName.equals(FONT_FAMILY, ignoreCase = true)
    }

    val value = position.parent as? XmlAttributeValue ?: return false
    val attribute = value.parent as? XmlAttribute ?: return false
    val before = value.text.take(caretOffset - value.textRange.startOffset)
    return isFontFamilyAttribute(attribute.name, before)
  }

  private fun isFontFamilyAttribute(
    name: String,
    textBeforeCaret: String
  ): Boolean {
    val isMappedProp = ConversionTable.bundled.mappingOf(name)?.cssProperty == FONT_FAMILY
    return when {
      isMappedProp || name == STYLE_FONT_FAMILY -> true
      name == STYLE -> styleDeclaration.containsMatchIn(textBeforeCaret)
      else -> false
    }
  }
}
