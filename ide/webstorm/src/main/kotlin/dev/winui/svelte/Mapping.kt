package dev.winui.svelte

internal data class Mapping(
  val cssProperty: String,
  val winuiProperty: String,
  val kind: ConversionKind,
  val enumTypes: Set<String>,
  val keywords: Map<String, String>,
  val defaultValue: String?
)
