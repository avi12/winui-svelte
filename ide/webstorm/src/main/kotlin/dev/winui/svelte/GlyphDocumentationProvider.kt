package dev.winui.svelte

import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.xml.XmlAttributeValue

class GlyphDocumentationProvider : AbstractDocumentationProvider() {
  override fun getCustomDocumentationElement(
    editor: Editor,
    file: PsiFile,
    contextElement: PsiElement?,
    targetOffset: Int
  ): PsiElement? {
    val value = contextElement?.parent as? XmlAttributeValue ?: return null
    return value.takeIf { GlyphValues.isGlyphValue(it, file) && GlyphValues.codePointOf(it) != null }
  }

  override fun generateDoc(
    element: PsiElement,
    originalElement: PsiElement?
  ): String? {
    val value = element as? XmlAttributeValue ?: return null
    val family = GlyphFont.family ?: return null
    return GlyphValues.codePointOf(value)?.let { GlyphDocumentation.html(it, family) }
  }
}
