package dev.winui.svelte

internal data class Mapping(
  val cssProperty: String,
  val kind: ConversionKind,
  val enumTypes: Set<String>,
  val keywords: Map<String, String>,
  val defaultValue: String?
)
