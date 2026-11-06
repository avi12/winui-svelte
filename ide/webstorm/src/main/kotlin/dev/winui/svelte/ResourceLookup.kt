package dev.winui.svelte

import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.ui.JBColor

internal object ResourceLookup {
  fun of(resource: WinuiResource): LookupElement {
    val element =
      LookupElementBuilder
        .create(resource, resource.property)
        .withTypeText(resource.kind, true)
    val light = resource.light?.let { CssColors.parse(it) }
    val dark = resource.dark?.let { CssColors.parse(it) }
    val swatch = light ?: dark ?: return element
    return element.withIcon(ColorSwatchIcon(JBColor(swatch, dark ?: swatch)))
  }
}
