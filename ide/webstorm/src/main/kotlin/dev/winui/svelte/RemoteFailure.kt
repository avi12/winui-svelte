package dev.winui.svelte

/** Why a remote picture was not fetched; [note] is what a hover tells. */
internal enum class RemoteFailure(
  val note: String
) {
  BLOCKED("the address is not allowed (only http and https, no credentials, no link-local host)"),
  TIMEOUT("the server did not answer in time"),
  STATUS("the server did not answer with the picture"),
  TOO_LARGE("the picture is over the size cap"),
  NOT_A_PICTURE("the answer is not a picture the previews can draw"),
  NETWORK("the server could not be reached")
}
