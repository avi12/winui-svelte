package dev.winui.svelte

import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.lang.injection.InjectedLanguageManager
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.impl.FakePsiElement

/** Shows the value of a theme resource in the documentation popup */
class ResourceDocumentationProvider : AbstractDocumentationProvider() {
  override fun getCustomDocumentationElement(
    editor: Editor,
    file: PsiFile,
    contextElement: PsiElement?,
    targetOffset: Int
  ): PsiElement? {
    val leaf = contextElement ?: return null
    val isEnabled = Settings.of(file.project).isResourceHintsEnabled
    val resource = resourceOf(leaf)
    val topLevelFile = InjectedLanguageManager.getInstance(file.project).getTopLevelFile(leaf.containingFile ?: file)
    val isWinui = WinuiProjectService.of(file.project).isWinuiFile(topLevelFile)
    return leaf.takeIf { isEnabled && resource != null && isWinui }
  }

  override fun generateDoc(
    element: PsiElement,
    originalElement: PsiElement?
  ): String? {
    val resource = (element as? ResourceDocumentationElement)?.resource ?: resourceOf(element) ?: return null
    return ResourceDocumentation.html(resource)
  }

  override fun getDocumentationElementForLookupItem(
    psiManager: PsiManager,
    obj: Any?,
    element: PsiElement?
  ): PsiElement? {
    val resource = obj as? WinuiResource ?: return null
    val parent = element ?: return null
    return ResourceDocumentationElement(parent, resource)
  }

  private fun resourceOf(leaf: PsiElement): WinuiResource? {
    val start = leaf.textRange.startOffset
    val reference = ResourceReferences.at(leaf.containingFile.text, start) ?: return null
    return WinuiIdeData.resourceOf(reference.property).takeIf { reference.start == start }
  }

  private class ResourceDocumentationElement(
    private val parentElement: PsiElement,
    val resource: WinuiResource
  ) : FakePsiElement() {
    override fun getParent() = parentElement

    override fun getName() = resource.property
  }
}
