package dev.winui.svelte

/** The words in the line where a picture cannot be drawn. */
internal object MarkerText {
  fun of(picture: Picture) =
    when (picture) {
      is Picture.Shown -> "[${picture.extension} ${picture.size.width} x ${picture.size.height} px]"
      is Picture.Missing -> "[file not found]"
      is Picture.TooLarge -> "[too large to preview]"
      is Picture.RemoteOff -> "[remote picture, previews are off]"
      is Picture.RemotePending -> "[fetching]"
      is Picture.RemoteFailed -> "[remote picture not fetched]"
    }
}
