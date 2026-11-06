package dev.winui.svelte

import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.lang.injection.InjectedLanguageManager
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.impl.FakePsiElement

/**
 * The popup of the CSS and layout previews: the gradient, contrast, easing, box model, grid tracks, shadow depth,
 * material, what a declaration becomes in WinUI and the answer of a media query, for the value under the caret.
 */
class CssPreviewDocumentationProvider : AbstractDocumentationProvider() {
  override fun getCustomDocumentationElement(
    editor: Editor,
    file: PsiFile,
    contextElement: PsiElement?,
    targetOffset: Int
  ): PsiElement? {
    val leaf = contextElement ?: return null
    val topLevelFile = InjectedLanguageManager.getInstance(file.project).getTopLevelFile(leaf.containingFile ?: file)
    val isWinui = WinuiProjectService.of(file.project).isWinuiFile(topLevelFile)
    if (!isWinui) {
      return null
    }

    val settings = Settings.of(file.project)
    val html =
      CssPreviews
        .of(editor.document.text, settings.enabledPreviews, settings.mediaEnvironment)
        .filter { targetOffset in it.start..it.end }
        .joinToString("<hr>") { it.html }
    return if (html.isEmpty()) {
      null
    } else {
      PreviewElement(leaf, html)
    }
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
