package dev.winui.svelte

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale

internal data class ImageSize(
  val width: Int,
  val height: Int,
  val frames: List<IconFrame>
)

/** What the first bytes of a picture file say; the same rules as `picture-image.ts`, tested against the same spec. */
internal object PictureImages {
  private const val PNG_WIDTH = 16
  private const val GIF_WIDTH = 6
  private const val BMP_WIDTH = 18
  private const val WEBP_SIZE = 24
  private const val SVG_HEAD_BYTES = 4096
  private const val JPEG_TAIL = 9
  private const val KIBIBYTE = 1024
  private const val BYTE_MASK = 0xFF
  private const val INT_BYTES = 4
  private const val INT_PAIR_BYTES = 8
  private const val JPEG_HEIGHT_AT = 5
  private const val JPEG_WIDTH_AT = 7
  private const val WEBP_EXTENDED_BYTES = 6
  private const val WEBP_HEIGHT_AT = 3
  private const val WORD_MASK = 0xFFFF
  private const val PNG_SIGNATURE = "89504e47"
  private const val GIF_SIGNATURE = "474946"
  private const val BMP_SIGNATURE = "424d"
  private const val JPEG_SIGNATURE = "ffd8"
  private val jpegFrames = setOf("c0", "c1", "c2", "c3", "c5", "c6", "c7", "c9", "ca", "cb", "cd", "ce", "cf")
  private val svgSizePattern =
    Regex("""\b(width|height)\s*=\s*["']\s*([0-9.]+)\s*(?:px)?\s*["']""", RegexOption.IGNORE_CASE)
  private val svgViewBox =
    Regex("""viewBox\s*=\s*["']\s*[-0-9.]+[ ,]+[-0-9.]+[ ,]+([0-9.]+)[ ,]+([0-9.]+)\s*["']""", RegexOption.IGNORE_CASE)
  private val webpExtended = Regex("^RIFF[\\s\\S]{4}WEBPVP8X")
  private val none = ImageSize(0, 0, emptyList())

  fun sizeOf(
    extension: String,
    bytes: ByteArray
  ): ImageSize =
    when (extension) {
      "ico" -> iconSize(bytes)
      "png" -> signed(bytes, PNG_SIGNATURE, PNG_WIDTH, ByteOrder.BIG_ENDIAN)
      "gif" -> signed(bytes, GIF_SIGNATURE, GIF_WIDTH, ByteOrder.LITTLE_ENDIAN)
      "bmp" -> signed(bytes, BMP_SIGNATURE, BMP_WIDTH, ByteOrder.LITTLE_ENDIAN)
      "jpg", "jpeg" -> jpegSize(bytes)
      "webp" -> webpSize(bytes)
      "svg" -> svgSize(bytes)
      else -> none
    }

  fun byteSizeText(size: Long): String =
    when {
      size < KIBIBYTE -> "$size B"
      size < KIBIBYTE * KIBIBYTE -> "%.1f KB".format(Locale.ROOT, size.toDouble() / KIBIBYTE)
      else -> "%.1f MB".format(Locale.ROOT, size.toDouble() / (KIBIBYTE * KIBIBYTE))
    }

  /** The line a hover shows under a picture: name, pixel size, file size and the frames of an `.ico`. */
  fun caption(
    name: String,
    size: ImageSize,
    byteSize: Long
  ): String {
    val dimensions =
      when {
        size.width > 0 -> "${size.width} x ${size.height} px"
        else -> "size unknown"
      }
    val frames =
      when {
        size.frames.size > 1 -> ", frames ${size.frames.joinToString(", ") { it.width.toString() }}"
        else -> ""
      }
    return "$name: $dimensions, ${byteSizeText(byteSize)}$frames"
  }

  private fun iconSize(bytes: ByteArray): ImageSize {
    val frames = IconFrames.of(bytes)
    val best = frames.getOrNull(IconFrames.bestIndex(frames))
    return ImageSize(best?.width ?: 0, best?.height ?: 0, frames)
  }

  private fun hexAt(
    bytes: ByteArray,
    at: Int,
    length: Int
  ) = bytes.drop(at).take(length).joinToString("") { "%02x".format(it) }

  private fun signed(
    bytes: ByteArray,
    signature: String,
    widthAt: Int,
    order: ByteOrder
  ): ImageSize {
    val isGif = signature == GIF_SIGNATURE
    val needed =
      widthAt +
        when {
          isGif -> INT_BYTES
          else -> INT_PAIR_BYTES
        }
    val isSigned = bytes.size >= needed && hexAt(bytes, 0, signature.length / 2) == signature
    if (!isSigned) {
      return none
    }

    val data = ByteBuffer.wrap(bytes).order(order)
    if (isGif) {
      val width = data.getShort(widthAt).toInt() and WORD_MASK
      return ImageSize(width, data.getShort(widthAt + 2).toInt() and WORD_MASK, emptyList())
    }

    return ImageSize(Math.abs(data.getInt(widthAt)), Math.abs(data.getInt(widthAt + INT_BYTES)), emptyList())
  }

  private fun jpegSize(bytes: ByteArray): ImageSize {
    val data = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
    if (hexAt(bytes, 0, 2) != JPEG_SIGNATURE) {
      return none
    }

    var at = 2
    while (at + JPEG_TAIL < bytes.size) {
      val marker = hexAt(bytes, at, 2)
      val isFrame = marker.startsWith("ff") && marker.substring(2) in jpegFrames
      if (isFrame) {
        val width = data.getShort(at + JPEG_WIDTH_AT).toInt() and WORD_MASK
        return ImageSize(width, data.getShort(at + JPEG_HEIGHT_AT).toInt() and WORD_MASK, emptyList())
      }

      at += 2 + (data.getShort(at + 2).toInt() and WORD_MASK)
    }

    return none
  }

  private fun webpSize(bytes: ByteArray): ImageSize {
    val head = String(bytes, 0, minOf(bytes.size, WEBP_SIZE), Charsets.ISO_8859_1)
    val isExtended = webpExtended.containsMatchIn(head) && bytes.size >= WEBP_SIZE + WEBP_EXTENDED_BYTES
    if (!isExtended) {
      return none
    }

    return ImageSize(
      littleEndian24(bytes, WEBP_SIZE) + 1,
      littleEndian24(bytes, WEBP_SIZE + WEBP_HEIGHT_AT) + 1,
      emptyList()
    )
  }

  private fun littleEndian24(
    bytes: ByteArray,
    at: Int
  ) = bytes[at].toInt() and BYTE_MASK or
    (bytes[at + 1].toInt() and BYTE_MASK shl Byte.SIZE_BITS) or
    (bytes[at + 2].toInt() and BYTE_MASK shl Short.SIZE_BITS)

  private fun svgSize(bytes: ByteArray): ImageSize {
    val text = String(bytes, 0, minOf(bytes.size, SVG_HEAD_BYTES), Charsets.UTF_8)
    val sizes =
      svgSizePattern.findAll(text).associate { it.groupValues[1].lowercase() to it.groupValues[2].toDouble().toInt() }
    val box = svgViewBox.find(text)
    return ImageSize(
      sizes["width"] ?: box
        ?.groupValues
        ?.get(1)
        ?.toDouble()
        ?.toInt() ?: 0,
      sizes["height"] ?: box
        ?.groupValues
        ?.get(2)
        ?.toDouble()
        ?.toInt() ?: 0,
      emptyList()
    )
  }
}
