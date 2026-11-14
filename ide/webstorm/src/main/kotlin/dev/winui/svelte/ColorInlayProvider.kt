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
import com.intellij.psi.xml.XmlAttribute
import javax.swing.JComponent
import javax.swing.JPanel

private const val SWATCH_GAP = 3

/** Shows a swatch beside every color the library takes, in the editor line */
class ColorInlayProvider : InlayHintsProvider<NoSettings> {
  override val key = SettingsKey<NoSettings>("winui.svelte.color.swatches")
  override val name = "winui-svelte color swatches"
  override val previewText = "<Border background=\"red\" style:color=\"#0af\" />"

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
    val isWinui = WinuiProjectService.of(file.project).isWinuiFile(file)
    if (!isWinui) {
      return null
    }

    return object : FactoryInlayHintsCollector(editor) {
      override fun collect(
        element: PsiElement,
        editor: Editor,
        sink: InlayHintsSink
      ): Boolean {
        val attribute = element as? XmlAttribute ?: return true
        val valueElement = attribute.valueElement ?: return true
        val textStart = valueElement.textRange.startOffset + valueElement.text.indexOf(attribute.value.orEmpty())
        for (spot in ColorSpots.of(attribute.name, attribute.value.orEmpty(), ConversionTable.bundled)) {
          val color = CssColors.parse(spot.text) ?: continue
          val swatch = factory.inset(factory.icon(ColorSwatchIcon(color)), right = SWATCH_GAP)
          sink.addInlineElement(textStart + spot.offset, true, swatch, false)
        }

        return true
      }
    }
  }
}
