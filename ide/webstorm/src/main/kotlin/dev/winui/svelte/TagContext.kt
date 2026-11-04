package dev.winui.svelte

internal data class ClassAttribute(
  val valueStart: Int,
  val valueEnd: Int,
  val value: String
)

internal data class TagContext(
  val tagName: String,
  val tagNameEnd: Int,
  val attributeStart: Int,
  val attributeEnd: Int,
  val classAttribute: ClassAttribute?,
  val hasDynamicClass: Boolean = false
)
