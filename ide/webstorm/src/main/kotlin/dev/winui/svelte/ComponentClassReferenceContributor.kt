package dev.winui.svelte

import com.intellij.lang.javascript.psi.JSLiteralExpression
import com.intellij.lang.javascript.psi.JSProperty
import com.intellij.patterns.PlatformPatterns
import com.intellij.patterns.StandardPatterns
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiReference
import com.intellij.psi.PsiReferenceContributor
import com.intellij.psi.PsiReferenceProvider
import com.intellij.psi.PsiReferenceRegistrar
import com.intellij.util.ProcessingContext

class ComponentClassReferenceContributor : PsiReferenceContributor() {
  override fun registerReferenceProviders(registrar: PsiReferenceRegistrar) {
    registrar.registerReferenceProvider(
      StandardPatterns.or(
        PlatformPatterns.psiElement(JSLiteralExpression::class.java),
        PlatformPatterns.psiElement(JSProperty::class.java)
      ),
      object : PsiReferenceProvider() {
        override fun getReferencesByElement(
          element: PsiElement,
          context: ProcessingContext
        ): Array<PsiReference> = ComponentClasses.referencesOf(element)
      }
    )
  }
}
