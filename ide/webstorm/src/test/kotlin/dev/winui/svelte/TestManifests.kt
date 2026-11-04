package dev.winui.svelte

internal object TestManifests {
  const val DEPENDENT = """{"dependencies":{"winui-svelte":"link:../winui-svelte"}}"""
  const val UNRELATED = """{"dependencies":{"svelte":"^5"}}"""
}
