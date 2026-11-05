package dev.winui.svelte

import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttributeValue

class GlyphDocumentationProvider : AbstractDocumentationProvider() {
  override fun getCustomDocumentationElement(
    editor: Editor,
    file: PsiFile,
    contextElement: PsiElement?,
    targetOffset: Int
  ): PsiElement? {
    val value = PsiTreeUtil.getParentOfType(contextElement, XmlAttributeValue::class.java, false) ?: return null
    val isGlyphValue = GlyphValues.isGlyphValue(value, file)
    val isOverAnIcon = GlyphValues.spotsOf(value).any { it.range.grown(1).contains(targetOffset) }
    return value.takeIf { isGlyphValue && isOverAnIcon }
  }

  override fun generateDoc(
    element: PsiElement,
    originalElement: PsiElement?
  ): String? {
    val value = element as? XmlAttributeValue ?: return null
    val family = GlyphFont.family ?: return null
    val spots = GlyphValues.spotsOf(value)
    val hovered = spots.firstOrNull { originalElement?.textRange?.intersects(it.range) == true } ?: spots.firstOrNull()
    return hovered?.let { GlyphDocumentation.html(it.codePoint, family) }
  }
}
