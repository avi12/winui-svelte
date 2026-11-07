package dev.winui.svelte

import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.lang.injection.InjectedLanguageManager
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.impl.FakePsiElement

/**
 * The popup of a picture: the picture larger with its name, pixel size, file size and, for an `.ico`, its frames;
 * the light and dark taskbar pictures of one object side by side on their backgrounds.
 */
class PictureDocumentationProvider : AbstractDocumentationProvider() {
  override fun getCustomDocumentationElement(
    editor: Editor,
    file: PsiFile,
    contextElement: PsiElement?,
    targetOffset: Int
  ): PsiElement? {
    val leaf = contextElement ?: return null
    val topLevelFile = InjectedLanguageManager.getInstance(file.project).getTopLevelFile(leaf.containingFile ?: file)
    val entries = PictureViews.entriesOf(topLevelFile)
    val here = entries.firstOrNull { (spot, _) -> targetOffset in spot.range.startOffset..spot.range.endOffset }
    return here?.let { PreviewElement(leaf, PictureHtml.of(PictureViews.withPartners(entries, it.first))) }
  }

  override fun generateDoc(
    element: PsiElement,
    originalElement: PsiElement?
  ) = (element as? PreviewElement)?.html

  private class PreviewElement(
    private val parentElement: PsiElement,
    val html: String
  ) : FakePsiElement() {
    override fun getParent() = parentElement
  }
}
