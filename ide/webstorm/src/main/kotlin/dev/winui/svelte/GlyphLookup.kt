package dev.winui.svelte

import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.codeInsight.lookup.LookupElementDecorator
import com.intellij.codeInsight.lookup.LookupElementPresentation
import com.intellij.codeInsight.lookup.LookupElementRenderer

internal object GlyphLookup {
  fun decorate(element: LookupElement): LookupElement {
    val codePoint = FluentGlyphs.codePoints[element.lookupString] ?: return element
    val icon = GlyphIcon(codePoint)
    return LookupElementDecorator.withRenderer(
      element,
      object : LookupElementRenderer<LookupElementDecorator<LookupElement>>() {
        override fun renderElement(
          element: LookupElementDecorator<LookupElement>,
          presentation: LookupElementPresentation
        ) {
          element.delegate.renderElement(presentation)
          presentation.icon = icon
          presentation.typeText = FluentGlyphs.label(codePoint)
        }
      }
    )
  }

  fun own(
    name: String,
    codePoint: Int
  ): LookupElement =
    LookupElementBuilder
      .create(name)
      .withIcon(GlyphIcon(codePoint))
      .withTypeText(FluentGlyphs.label(codePoint), true)
}
