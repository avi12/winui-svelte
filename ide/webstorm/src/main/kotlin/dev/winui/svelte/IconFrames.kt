package dev.winui.svelte

import java.nio.ByteBuffer
import java.nio.ByteOrder

internal data class IconFrame(
  val width: Int,
  val height: Int,
  val bitCount: Int,
  val size: Int,
  val offset: Int
)

/** The frames an `.ico` file lists, and which of them to show. */
internal object IconFrames {
  private const val ENTRIES = 6
  private const val ENTRY_SIZE = 16
  private const val COUNT_AT = 4
  private const val BIT_COUNT_AT = 6
  private const val SIZE_AT = 8
  private const val OFFSET_AT = 12
  private const val LARGE = 256
  private const val BYTE_MASK = 0xFF
  private const val WORD_MASK = 0xFFFF

  fun of(bytes: ByteArray): List<IconFrame> {
    val data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    val isIcon = bytes.size >= ENTRIES && data.getShort(0).toInt() == 0 && data.getShort(2).toInt() == 1
    if (!isIcon) {
      return emptyList()
    }

    val count = data.getShort(COUNT_AT).toInt() and WORD_MASK
    return (0 until count)
      .takeWhile { ENTRIES + (it + 1) * ENTRY_SIZE <= bytes.size }
      .map {
        val at = ENTRIES + it * ENTRY_SIZE
        IconFrame(
          width = sideOf(data.get(at)),
          height = sideOf(data.get(at + 1)),
          bitCount = data.getShort(at + BIT_COUNT_AT).toInt() and WORD_MASK,
          size = data.getInt(at + SIZE_AT),
          offset = data.getInt(at + OFFSET_AT)
        )
      }
  }

  /** The index of the frame to show: the largest, and of those the deepest in color. */
  fun bestIndex(frames: List<IconFrame>): Int {
    var best = 0
    for ((i, frame) in frames.withIndex()) {
      val current = frames[best]
      val area = frame.width * frame.height
      val currentArea = current.width * current.height
      val isDeeper = area == currentArea && frame.bitCount > current.bitCount
      if (area > currentArea || isDeeper) {
        best = i
      }
    }

    return best
  }

  private fun sideOf(byte: Byte) = (byte.toInt() and BYTE_MASK).takeIf { it > 0 } ?: LARGE
}
