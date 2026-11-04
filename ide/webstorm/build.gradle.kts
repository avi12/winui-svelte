import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
  kotlin("jvm") version "2.4.21"
  id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "dev.winui.svelte"
version = providers.gradleProperty("pluginVersion").get()

val webstormHome = providers.gradleProperty("webstormHome").orElse(providers.environmentVariable("WEBSTORM_HOME"))
val svelteHome = providers.gradleProperty("svelteHome")

repositories {
  mavenCentral()
  intellijPlatform {
    defaultRepositories()
  }
}

dependencies {
  intellijPlatform {
    local(webstormHome.get())
    localPlugin(svelteHome.get())
    bundledPlugin("JavaScript")
    testFramework(TestFrameworkType.Platform)
  }
  testImplementation(platform("org.junit:junit-bom:5.13.4"))
  testImplementation("org.junit.jupiter:junit-jupiter")
  testImplementation("junit:junit:4.13.2")
  testRuntimeOnly("org.junit.vintage:junit-vintage-engine")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin {
  jvmToolchain(24)
}

intellijPlatform {
  pluginConfiguration {
    name = "winui-svelte"
    ideaVersion {
      sinceBuild = "262"
      untilBuild = provider { null }
    }
  }
  buildSearchableOptions = false
}

tasks.test {
  useJUnitPlatform()
}
