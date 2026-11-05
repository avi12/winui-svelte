package dev.winui.svelte

import com.google.gson.JsonParser
import com.intellij.psi.xml.XmlTag

internal class TypedProps(
  private val resource: String,
  private val inputType: String
) {
  private val attributes: Map<String, Set<String>> by lazy {
    val stream = TypedProps::class.java.getResourceAsStream(resource) ?: error("$resource is missing from the plugin")
    val table = JsonParser.parseString(stream.bufferedReader().use { it.readText() }).asJsonObject
    table.getAsJsonObject("attributes").entrySet().associate { (tag, keys) ->
      tag to keys.asJsonArray.map { it.asString }.toSet()
    }
  }

  fun isOwn(
    tag: String?,
    attribute: String
  ) = attributes[tag]?.contains(attribute) == true

  fun isProp(
    tag: XmlTag,
    attribute: String
  ): Boolean {
    if (isOwn(tag.name, attribute)) {
      return true
    }

    val component = ComponentFile.of(tag) ?: return false
    return declaresAs(component.text, attribute)
  }

  fun declaresAs(
    source: String,
    prop: String
  ) = Regex("""\b${Regex.escape(prop)}\??\s*:\s*$inputType\b""").containsMatchIn(source)

  companion object {
    val glyph = TypedProps("/fluent-glyphs.json", "GlyphInput")
    val fontFamily = TypedProps("/font-family-props.json", "FontFamilyInput")
  }
}
