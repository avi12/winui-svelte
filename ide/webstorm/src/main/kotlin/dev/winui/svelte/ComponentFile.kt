package dev.winui.svelte

import com.intellij.psi.PsiFile
import com.intellij.psi.SyntaxTraverser
import com.intellij.psi.xml.XmlTag

internal object ComponentFile {
  fun of(tag: XmlTag): PsiFile? {
    val binding = tag.references.firstNotNullOfOrNull { it.resolve() } ?: return null
    val declaration = binding.parent ?: return null
    return SyntaxTraverser
      .psiTraverser(declaration)
      .flatMap { it.references.asIterable() }
      .firstNotNullOfOrNull { it.resolve() as? PsiFile }
  }
}
