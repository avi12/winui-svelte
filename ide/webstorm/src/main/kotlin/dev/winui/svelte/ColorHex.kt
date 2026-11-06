package dev.winui.svelte

import java.awt.Color

/** The `#rrggbbaa` of a color, the one spelling the CSS previews and their shared fixtures use. */
internal fun Color.toHexWithAlpha() = "#%02x%02x%02x%02x".format(red, green, blue, alpha)
