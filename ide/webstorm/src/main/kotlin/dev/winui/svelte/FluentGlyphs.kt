package dev.winui.svelte

import com.google.gson.JsonParser

internal object FluentGlyphs {
  private const val RESOURCE = "/fluent-glyphs.json"
  private const val HEX_RADIX = 16

  private val table by lazy {
    val stream =
      FluentGlyphs::class.java.getResourceAsStream(RESOURCE)
        ?: error("$RESOURCE is missing from the plugin")
    JsonParser.parseString(stream.bufferedReader().use { it.readText() }).asJsonObject
  }

  private val glyphAttributes: Map<String, Set<String>> by lazy {
    table.getAsJsonObject("attributes").entrySet().associate { (tag, keys) ->
      tag to keys.asJsonArray.map { it.asString }.toSet()
    }
  }

  fun isGlyphAttribute(
    tag: String?,
    attribute: String
  ) = glyphAttributes[tag]?.contains(attribute) == true

  val codePoints: Map<String, Int> by lazy {
    table.getAsJsonObject("glyphs").entrySet().associate { (name, code) -> name to code.asString.toInt(HEX_RADIX) }
  }

  fun label(codePoint: Int) = "U+%04X".format(codePoint)
}
