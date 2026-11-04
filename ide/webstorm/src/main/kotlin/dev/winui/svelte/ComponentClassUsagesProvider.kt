package dev.winui.svelte

import com.intellij.psi.PsiElement
import com.intellij.psi.css.CssSelectorSuffix
import com.intellij.psi.css.CssSelectorSuffixType
import com.intellij.psi.css.usages.CssClassOrIdReferenceBasedUsagesProvider

class ComponentClassUsagesProvider : CssClassOrIdReferenceBasedUsagesProvider() {
  override fun acceptElement(candidate: PsiElement) =
    ComponentClasses.isClassHost(candidate) || ComponentClasses.directiveClassOf(candidate) != null

  override fun isUsage(
    selectorSuffix: CssSelectorSuffix,
    candidate: PsiElement,
    offsetInCandidate: Int
  ): Boolean {
    val directive =
      ComponentClasses.directiveClassOf(candidate) ?: return super.isUsage(selectorSuffix, candidate, offsetInCandidate)
    return selectorSuffix.type == CssSelectorSuffixType.CLASS && selectorSuffix.name?.removePrefix(".") == directive
  }
}
