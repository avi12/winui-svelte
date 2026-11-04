import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
  kotlin("jvm") version "2.4.21"
  id("org.jetbrains.intellij.platform") version "2.19.0"
  id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
  id("io.gitlab.arturbosch.detekt") version "1.23.8"
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
    bundledPlugin("com.intellij.css")
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

ktlint {
  version.set("1.8.0")
  ignoreFailures.set(false)
  reporters {
    reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.PLAIN)
  }
}

detekt {
  buildUponDefaultConfig = true
  config.setFrom(files("$projectDir/config/detekt/detekt.yml"))
  autoCorrect = false
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
  jvmTarget = "21"
}

tasks.register("ktLint") {
  group = "verification"
  description = "Run ktlint + detekt (Kotlin lint)."
  dependsOn("ktlintCheck", "detekt")
}

tasks.register("ktLintFix") {
  group = "verification"
  description = "Auto-fix ktlint formatting, then run detekt."
  dependsOn("ktlintFormat", "detekt")
}
