package dev.winui.svelte

import com.intellij.openapi.util.TextRange
import com.intellij.psi.AbstractElementManipulator
import com.intellij.psi.impl.source.tree.LeafElement
import com.intellij.psi.xml.XmlTokenType
import dev.blachut.svelte.lang.psi.SvelteHtmlAttribute

class DirectiveNameManipulator : AbstractElementManipulator<SvelteHtmlAttribute>() {
  override fun handleContentChange(
    element: SvelteHtmlAttribute,
    range: TextRange,
    newContent: String
  ): SvelteHtmlAttribute {
    val name = element.node.findChildByType(XmlTokenType.XML_NAME)
    if (name is LeafElement) {
      name.replaceWithText(name.text.replaceRange(range.startOffset, range.endOffset, newContent))
    }

    return element
  }
}
