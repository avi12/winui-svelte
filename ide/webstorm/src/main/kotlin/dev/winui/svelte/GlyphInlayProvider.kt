package dev.winui.svelte

import com.intellij.codeInsight.hints.ChangeListener
import com.intellij.codeInsight.hints.FactoryInlayHintsCollector
import com.intellij.codeInsight.hints.ImmediateConfigurable
import com.intellij.codeInsight.hints.InlayHintsCollector
import com.intellij.codeInsight.hints.InlayHintsProvider
import com.intellij.codeInsight.hints.InlayHintsSink
import com.intellij.codeInsight.hints.NoSettings
import com.intellij.codeInsight.hints.SettingsKey
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.xml.XmlAttributeValue
import javax.swing.JComponent
import javax.swing.JPanel

@Suppress("UnstableApiUsage")
class GlyphInlayProvider : InlayHintsProvider<NoSettings> {
  override val key = SettingsKey<NoSettings>("winui.svelte.glyph.icons")
  override val name = "winui-svelte glyph icons"
  override val previewText = "<FontIcon glyph=\"Save\" />"

  override fun createSettings() = NoSettings()

  override fun createConfigurable(settings: NoSettings) =
    object : ImmediateConfigurable {
      override fun createComponent(listener: ChangeListener): JComponent = JPanel()
    }

  override fun getCollectorFor(
    file: PsiFile,
    editor: Editor,
    settings: NoSettings,
    sink: InlayHintsSink
  ): InlayHintsCollector? {
    if (GlyphFont.family == null) {
      return null
    }

    return object : FactoryInlayHintsCollector(editor) {
      override fun collect(
        element: PsiElement,
        editor: Editor,
        sink: InlayHintsSink
      ): Boolean {
        val value = element as? XmlAttributeValue ?: return true
        if (!GlyphValues.isGlyphValue(value, file)) {
          return true
        }

        val codePoint = GlyphValues.codePointOf(value) ?: return true
        sink.addInlineElement(value.textRange.endOffset, true, factory.icon(GlyphIcon(codePoint)), false)
        return true
      }
    }
  }
}
