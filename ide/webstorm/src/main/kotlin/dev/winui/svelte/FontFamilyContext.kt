package dev.winui.svelte

import com.intellij.psi.PsiElement
import com.intellij.psi.css.CssDeclaration
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlAttributeValue
import com.intellij.psi.xml.XmlTag

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
    val tag = attribute.parent ?: return false
    return isFontFamilyAttribute(tag, attribute.name, before)
  }

  private fun isFontFamilyAttribute(
    tag: XmlTag,
    name: String,
    textBeforeCaret: String
  ): Boolean =
    when {
      name == STYLE_FONT_FAMILY || TypedProps.fontFamily.isProp(tag, name) -> true
      name == STYLE -> styleDeclaration.containsMatchIn(textBeforeCaret)
      else -> false
    }
}
