package dev.winui.svelte

import java.util.Locale

/** How the previews write a number: whole when it is whole, else to a tenth. */
internal object PreviewText {
  private const val PERCENT = 100.0

  fun number(value: Double) =
    if (value ==
      value.toLong().toDouble()
    ) {
      "${value.toLong()}"
    } else {
      "%.1f".format(Locale.ROOT, value)
    }

  fun millis(value: Double) = "${number(value)}ms"

  fun percent(position: Double) = "${number(position * PERCENT)}%"
}
