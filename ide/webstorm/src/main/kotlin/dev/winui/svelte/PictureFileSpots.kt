package dev.winui.svelte

import com.intellij.psi.PsiFile
import com.intellij.psi.util.CachedValueProvider
import com.intellij.psi.util.CachedValuesManager
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute

/**
 * Every picture written in a file: the value of an attribute the library types as a picture, found in the shared
 * IDE data, and a `key: "..."` of a script. No component is named here.
 */
internal object PictureFileSpots {
  fun of(file: PsiFile): List<PictureSpot> =
    CachedValuesManager.getCachedValue(file) {
      CachedValueProvider.Result.create(compute(file), file)
    }

  private fun compute(file: PsiFile): List<PictureSpot> {
    val names = WinuiIdeData.pictureNames
    val attributes = PsiTreeUtil.findChildrenOfType(file, XmlAttribute::class.java)
    val inMarkup = attributes.flatMap { spotsOf(it, names) }
    return PictureSpots.unique(inMarkup + PictureSpots.keys(file.text, names))
  }

  private fun spotsOf(
    attribute: XmlAttribute,
    names: PictureNames
  ): List<PictureSpot> {
    val tag = attribute.parent ?: return emptyList()
    val isPicture = WinuiIdeData.isPictureProp(tag.name, attribute.name) || declaresPicture(attribute)
    val valueElement = attribute.valueElement
    if (!isPicture || valueElement == null) {
      return emptyList()
    }

    val text = valueElement.text
    val start = valueElement.textRange.startOffset
    if (text.startsWith(SvelteSyntax.MUSTACHE_START)) {
      return PictureSpots.expression(attribute.name, text, start, names)
    }

    val value = attribute.value ?: return emptyList()
    return PictureSpots.plain(attribute.name, value, start + text.indexOf(value), names)
  }

  private fun declaresPicture(attribute: XmlAttribute): Boolean {
    val tag = attribute.parent ?: return false
    val source = ComponentFile.of(tag)?.text ?: return false
    return Regex("""\b${Regex.escape(attribute.name)}\??\s*:\s*PictureSource\b""").containsMatchIn(source)
  }
}
