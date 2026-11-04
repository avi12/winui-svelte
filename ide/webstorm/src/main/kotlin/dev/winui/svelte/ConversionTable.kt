package dev.winui.svelte

import com.google.gson.JsonObject
import com.google.gson.JsonParser

enum class ConversionKind(val jsonName: String) {
  KEYWORD("keyword"),
  LENGTH("length"),
  NUMBER("number"),
  COLOR("color"),
  THICKNESS("thickness"),
  CORNER_RADIUS("cornerRadius"),
  TEXT("text"),
  UNSUPPORTED("unsupported");

  companion object {
    fun named(jsonName: String) = entries.firstOrNull { it.jsonName == jsonName } ?: UNSUPPORTED
  }
}

data class Mapping(
  val cssProperty: String,
  val kind: ConversionKind,
  val enumTypes: Set<String>,
  val keywords: Map<String, String>
)

class ConversionTable(private val mappings: Map<String, Mapping>) {
  val size get() = mappings.size

  fun mappingOf(attributeName: String): Mapping? =
    mappings[attributeName]?.takeIf { it.kind != ConversionKind.UNSUPPORTED }

  fun countOf(kind: ConversionKind) = mappings.values.count { it.kind == kind }

  companion object {
    private const val RESOURCE = "/winui-css-mappings.json"

    val bundled: ConversionTable by lazy {
      val stream = ConversionTable::class.java.getResourceAsStream(RESOURCE)
        ?: error("$RESOURCE is missing from the plugin")
      parse(stream.bufferedReader().use { it.readText() })
    }

    fun parse(text: String): ConversionTable {
      val attributes = JsonParser.parseString(text).asJsonObject.getAsJsonObject("attributes")
      return ConversionTable(attributes.entrySet().associate { (name, entry) ->
        name to mappingOf(entry.asJsonObject)
      })
    }

    private fun mappingOf(entry: JsonObject) = Mapping(
      cssProperty = entry.get("cssProperty").asString,
      kind = ConversionKind.named(entry.get("kind").asString),
      enumTypes = entry.getAsJsonArray("enumTypes").map { it.asString }.toSet(),
      keywords = entry.getAsJsonObject("keywords")
        ?.entrySet()
        ?.associate { (key, value) -> key.lowercase() to value.asString }
        ?: emptyMap()
    )
  }
}
