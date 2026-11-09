package dev.winui.svelte

import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import javax.imageio.ImageIO

/** The popup of a picture: the picture larger, with its name, size and frames; a light and dark pair side by side. */
internal object PictureHtml {
  private const val SETTING_NAME = "Preview remote pictures"

  fun of(entries: List<Pair<PictureSpot, Picture>>): String {
    val cells = entries.joinToString("") { (spot, picture) -> cell(spot, picture) }
    return "<table cellspacing=\"6\"><tr>$cells</tr></table>"
  }

  private fun cell(
    spot: PictureSpot,
    picture: Picture
  ): String {
    val theme =
      when (spot.variant) {
        PictureVariant.ANY -> ""
        else -> " (for the ${spot.variant.name.lowercase()} taskbar)"
      }
    val background = PictureSpec.backgroundOf(spot.variant)?.let { " bgcolor=\"$it\"" }.orEmpty()
    return "<td valign=\"top\"$background>${body(picture)}<br><i>$theme</i></td>"
  }

  private fun body(picture: Picture): String =
    when (picture) {
      is Picture.Shown -> shown(picture)

      is Picture.Missing -> "<b>${esc(
        picture.name
      )}</b><br>file not found, looked in<br>${picture.candidates.joinToString("<br>") { esc(it) }}"

      is Picture.TooLarge -> "<b>${esc(
        picture.name
      )}</b><br>${PictureImages.byteSizeText(picture.byteSize)}, too large to preview"

      is Picture.RemoteOff -> "<b>${esc(picture.name)}</b><br>${remoteOffNote(picture)}"

      is Picture.RemotePending -> "<b>${esc(picture.name)}</b><br>fetching"

      is Picture.RemoteFailed -> "<b>${esc(picture.name)}</b><br>not fetched: ${esc(picture.failure.note)}"
    }

  private fun remoteOffNote(picture: Picture.RemoteOff) =
    when {
      picture.isUntrusted -> "remote picture, not fetched: the project is not trusted"
      else -> "remote picture, previews are off<br>turn on \"$SETTING_NAME\" in Settings, winui-svelte"
    }

  private fun shown(picture: Picture.Shown): String {
    val caption = esc(PictureImages.caption(picture.name, picture.size, picture.byteSize))
    val url = picture.image?.let { thumbnailUrl(it) }
    if (url == null) {
      return "[${esc(picture.extension)} picture the IDE cannot draw]<br>$caption"
    }

    return "<img src=\"$url\"><br>$caption"
  }

  // The popup draws pictures from files, so the larger picture is written once, named by its pixels.
  private fun thumbnailUrl(image: BufferedImage): String? {
    val size = PictureSpec.limits.hoverSize
    val scale = minOf(size.toDouble() / image.width, size.toDouble() / image.height)
    val width = maxOf(1, (image.width * scale).toInt())
    val height = maxOf(1, (image.height * scale).toInt())
    val scaled = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
    val canvas = scaled.createGraphics()
    try {
      val isEnlarged = scale > 1
      val interpolation =
        when {
          isEnlarged -> RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR
          else -> RenderingHints.VALUE_INTERPOLATION_BILINEAR
        }
      canvas.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interpolation)
      canvas.drawImage(image, 0, 0, width, height, null)
    } finally {
      canvas.dispose()
    }

    val bytes = ByteArrayOutputStream().also { ImageIO.write(scaled, "png", it) }.toByteArray()
    val name = MessageDigest.getInstance("SHA-1").digest(bytes).joinToString("") { "%02x".format(it) }
    val file = File(RemotePictures.folder, "preview-$name.png")
    if (!file.isFile) {
      file.writeBytes(bytes)
    }

    return file.toURI().toString()
  }

  private fun esc(text: String) = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
}
