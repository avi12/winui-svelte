package dev.winui.svelte

internal data class TextEdit(
  val start: Int,
  val end: Int,
  val text: String
)

internal object TextEdits {
  fun inApplicationOrder(edits: List<TextEdit>) =
    edits.sortedWith(compareByDescending<TextEdit> { it.start }.thenByDescending { it.end })

  fun apply(
    fileText: String,
    edits: List<TextEdit>
  ) = inApplicationOrder(edits).fold(fileText) { text, edit -> text.replaceRange(edit.start, edit.end, edit.text) }
}
