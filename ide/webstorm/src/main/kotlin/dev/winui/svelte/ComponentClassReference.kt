package dev.winui.svelte

import com.intellij.lang.javascript.psi.JSProperty
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiReferenceBase
import com.intellij.psi.impl.source.tree.LeafElement

internal class ComponentClassReference(
  host: PsiElement,
  range: TextRange,
  private val name: String
) : PsiReferenceBase<PsiElement>(host, range, true) {
  override fun resolve(): PsiElement? =
    ComponentClasses.classesIn(element.containingFile).firstOrNull { it.name == name }

  override fun getVariants(): Array<Any> =
    ComponentClasses
      .classesIn(element.containingFile)
      .mapNotNull { it.name }
      .distinct()
      .toTypedArray()

  override fun handleElementRename(newElementName: String): PsiElement {
    val key = element.firstChild
    if (element is JSProperty && key is LeafElement) {
      key.replaceWithText(key.text.replaceRange(rangeInElement.startOffset, rangeInElement.endOffset, newElementName))
      return element
    }

    return super.handleElementRename(newElementName)
  }
}
