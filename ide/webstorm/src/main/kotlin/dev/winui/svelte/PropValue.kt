package dev.winui.svelte

sealed interface PropValue {
  data class Text(val text: String) : PropValue

  data class Number(val literal: String) : PropValue

  data class Flag(val isOn: Boolean) : PropValue

  data class Member(val qualifier: String, val name: String) : PropValue

  data class Tuple(val numbers: List<String>) : PropValue

  data class Conditional(
    val condition: String,
    val whenTrue: PropValue,
    val whenFalse: PropValue
  ) : PropValue
}
