package dev.winui.svelte

import com.intellij.openapi.util.IconLoader
import com.intellij.util.IconUtil
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.imageio.ImageIO

/** Turns the bytes of a picture file into pixels, for the kinds the IDE can decode; the others return nothing. */
internal object PictureDecoder {
  private const val BITS_32 = 32
  private const val BITS_24 = 24
  private const val DIB_HEADER_BITS = 14
  private const val DIB_HEADER_SIZE = 0
  private const val ALPHA_SHIFT = 24
  private const val RED_SHIFT = 16
  private const val GREEN_SHIFT = 8
  private const val BYTE_MASK = 0xFF
  private const val OPAQUE = 0xFF000000.toInt()
  private const val PNG_SIGNATURE = 0x89504E47.toInt()

  fun decode(
    extension: String,
    bytes: ByteArray,
    file: File?
  ): BufferedImage? =
    when (extension) {
      "ico" -> iconImage(bytes)
      "svg" -> file?.let { svgImage(it) }
      "png", "jpg", "jpeg", "gif", "bmp", "webp" -> raster(bytes)
      else -> null
    }

  private fun raster(bytes: ByteArray): BufferedImage? = ImageIO.read(ByteArrayInputStream(bytes))

  private fun svgImage(file: File): BufferedImage? {
    val icon = IconLoader.findIcon(file.toURI().toURL()) ?: return null
    return IconUtil.toBufferedImage(icon)
  }

  private fun iconImage(bytes: ByteArray): BufferedImage? {
    val frames = IconFrames.of(bytes)
    val frame = frames.getOrNull(IconFrames.bestIndex(frames)) ?: return null
    val isInside = frame.offset >= 0 && frame.size > 0 && frame.offset + frame.size <= bytes.size
    if (!isInside) {
      return null
    }

    val data = bytes.copyOfRange(frame.offset, frame.offset + frame.size)
    val isPng = ByteBuffer.wrap(data).order(ByteOrder.BIG_ENDIAN).getInt(0) == PNG_SIGNATURE
    return when {
      isPng -> raster(data)
      else -> deviceIndependentBitmap(data, frame)
    }
  }

  // A frame that is not a PNG is a bitmap without its file header, 32 or 24 bits per pixel, with a mask for 24.
  private fun deviceIndependentBitmap(
    data: ByteArray,
    frame: IconFrame
  ): BufferedImage? {
    val header = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
    val headerSize = header.getInt(DIB_HEADER_SIZE)
    val bits = header.getShort(DIB_HEADER_BITS).toInt()
    val isSupported = bits == BITS_32 || bits == BITS_24
    if (!isSupported) {
      return null
    }

    val rowBytes = (frame.width * bits / Byte.SIZE_BITS + 3) / 4 * 4
    val image = BufferedImage(frame.width, frame.height, BufferedImage.TYPE_INT_ARGB)
    for (row in 0 until frame.height) {
      val sourceRow = frame.height - 1 - row
      val rowStart = headerSize + sourceRow * rowBytes
      for (column in 0 until frame.width) {
        val at = rowStart + column * bits / Byte.SIZE_BITS
        val isInside = at + bits / Byte.SIZE_BITS <= data.size
        if (isInside) {
          image.setRGB(column, row, pixelAt(data, at, bits))
        }
      }
    }

    return image
  }

  private fun pixelAt(
    data: ByteArray,
    at: Int,
    bits: Int
  ): Int {
    val blue = data[at].toInt() and BYTE_MASK
    val green = data[at + 1].toInt() and BYTE_MASK
    val red = data[at + 2].toInt() and BYTE_MASK
    val alpha =
      when (bits) {
        BITS_32 -> data[at + 3].toInt() and BYTE_MASK
        else -> BYTE_MASK
      }
    val isOpaque24 = bits == BITS_24
    val base = (red shl RED_SHIFT) or (green shl GREEN_SHIFT) or blue
    return when {
      isOpaque24 -> base or OPAQUE
      else -> base or (alpha shl ALPHA_SHIFT)
    }
  }
}
