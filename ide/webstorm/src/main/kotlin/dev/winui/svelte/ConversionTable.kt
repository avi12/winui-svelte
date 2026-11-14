package dev.winui.svelte

import com.google.gson.JsonObject
import com.google.gson.JsonParser

internal class ConversionTable(
  private val mappings: Map<String, Mapping>
) {
  val size get() = mappings.size

  fun mappingOf(attributeName: String): Mapping? =
    mappings[attributeName]?.takeIf { it.kind != ConversionKind.UNSUPPORTED }

  fun isColorProperty(cssProperty: String) =
    cssProperty in EXTRA_COLOR_PROPERTIES ||
      mappings.values.any { it.kind == ConversionKind.COLOR && it.cssProperty == cssProperty }

  /** The CSS property of every prop that has a counterpart, by the prop's name. */
  fun cssPropertiesByAttribute() = mappings.mapValues { it.value.cssProperty }

  /** The WinUI properties a CSS property sets, for every one that converts. */
  fun winuiTargets() =
    mappings.values
      .filter { it.kind != ConversionKind.UNSUPPORTED }
      .groupBy({ it.cssProperty }, { it.winuiProperty })

  fun countOf(kind: ConversionKind) = mappings.values.count { it.kind == kind }

  companion object {
    private val EXTRA_COLOR_PROPERTIES =
      setOf(
        "color",
        "fill",
        "stroke",
        "outline-color",
        "caret-color",
        "accent-color",
        "text-decoration-color",
        "border-top-color",
        "border-right-color",
        "border-bottom-color",
        "border-left-color",
        "column-rule-color"
      )

    val bundled: ConversionTable by lazy { parse(MappingResource.text) }

    fun parse(text: String): ConversionTable {
      val attributes = JsonParser.parseString(text).asJsonObject.getAsJsonObject("attributes")
      return ConversionTable(
        attributes.entrySet().associate { (name, entry) ->
          name to mappingOf(entry.asJsonObject)
        }
      )
    }

    private fun mappingOf(entry: JsonObject) =
      Mapping(
        cssProperty = entry.get("cssProperty").asString,
        winuiProperty = entry.get("winuiProperty").asString,
        kind = ConversionKind.named(entry.get("kind").asString),
        enumTypes = entry.getAsJsonArray("enumTypes").map { it.asString }.toSet(),
        keywords =
          entry
            .getAsJsonObject("keywords")
            ?.entrySet()
            ?.associate { (key, value) -> key.lowercase() to value.asString }
            .orEmpty(),
        defaultValue = entry.get("defaultValue")?.asString
      )
  }
}
