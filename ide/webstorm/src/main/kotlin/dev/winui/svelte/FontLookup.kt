package dev.winui.svelte

import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementDecorator
import com.intellij.codeInsight.lookup.LookupElementPresentation
import com.intellij.codeInsight.lookup.LookupElementRenderer

internal object FontLookup {
  fun decorate(element: LookupElement): LookupElement {
    val family = FontFamilies.nameOf(element.lookupString)
    if (!FontFamilies.isInstalled(family)) {
      return element
    }

    val icon = FontSampleIcon(family)
    return LookupElementDecorator.withRenderer(
      element,
      object : LookupElementRenderer<LookupElementDecorator<LookupElement>>() {
        override fun renderElement(
          element: LookupElementDecorator<LookupElement>,
          presentation: LookupElementPresentation
        ) {
          element.delegate.renderElement(presentation)
          presentation.icon = icon
        }
      }
    )
  }
}
