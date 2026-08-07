#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const gradlePropsPath = path.join(root, "android", "gradle.properties");
const androidAppBuildGradlePath = path.join(root, "android", "app", "build.gradle");
const plistPath = path.join(root, "ios", "ExpressAccounts", "Info.plist");
const pbxprojPath = path.join(root, "ios", "ExpressAccounts.xcodeproj", "project.pbxproj");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, contents) {
  fs.writeFileSync(filePath, contents, "utf8");
}

function parseVersion(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  return { major, minor, patch };
}

function versionToBuildNumber(version) {
  const { major, minor, patch } = parseVersion(version);
  return major * 10000 + minor * 100 + patch;
}

function parseEnvInt(name) {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function replaceRequired(contents, pattern, replacement, label) {
  if (!pattern.test(contents)) {
    throw new Error(`Unable to update ${label}: pattern not found.`);
  }

  return contents.replace(pattern, replacement);
}

function replaceOrAppend(contents, pattern, replacementLine) {
  if (pattern.test(contents)) {
    return contents.replace(pattern, replacementLine);
  }

  const suffix = contents.endsWith("\n") ? "" : "\n";
  return `${contents}${suffix}${replacementLine}\n`;
}

function getBuildNumber(version) {
  const explicit =
    parseEnvInt("BUILD_NUMBER") ||
    parseEnvInt("IOS_BUILD_NUMBER") ||
    parseEnvInt("ANDROID_VERSION_CODE");

  if (explicit) {
    return explicit;
  }

  const fromVersion = versionToBuildNumber(version);
  const fromTime = Math.floor(Date.now() / 1000);
  return Math.max(fromVersion, fromTime);
}

function syncGradleProperties(version, buildNumber) {
  let contents = readText(gradlePropsPath);

  contents = replaceOrAppend(
    contents,
    /^android\.versionCode=.*$/m,
    `android.versionCode=${buildNumber}`
  );

  contents = replaceOrAppend(
    contents,
    /^android\.versionName=.*$/m,
    `android.versionName=${version}`
  );

  writeText(gradlePropsPath, contents);
}

function syncAndroidAppBuildGradle(version, buildNumber) {
  let contents = readText(androidAppBuildGradlePath);

  contents = replaceRequired(
    contents,
    /(\bversionCode\s+)\d+/m,
    `$1${buildNumber}`,
    "android app versionCode"
  );

  contents = replaceRequired(
    contents,
    /(\bversionName\s+")[^"]*(")/m,
    `$1${version}$2`,
    "android app versionName"
  );

  writeText(androidAppBuildGradlePath, contents);
}

function syncInfoPlist(version, buildNumber) {
  let contents = readText(plistPath);

  contents = replaceRequired(
    contents,
    /<key>CFBundleShortVersionString<\/key>\s*<string>[^<]*<\/string>/m,
    `<key>CFBundleShortVersionString</key>\n\t<string>${version}</string>`,
    "CFBundleShortVersionString"
  );

  contents = replaceRequired(
    contents,
    /<key>CFBundleVersion<\/key>\s*<string>[^<]*<\/string>/m,
    `<key>CFBundleVersion</key>\n\t<string>${buildNumber}</string>`,
    "CFBundleVersion"
  );

  writeText(plistPath, contents);
}

function syncPbxproj(version, buildNumber) {
  let contents = readText(pbxprojPath);

  contents = replaceRequired(
    contents,
    /CURRENT_PROJECT_VERSION = [0-9]+;/g,
    `CURRENT_PROJECT_VERSION = ${buildNumber};`,
    "CURRENT_PROJECT_VERSION"
  );

  contents = replaceRequired(
    contents,
    /MARKETING_VERSION = [0-9]+\.[0-9]+\.[0-9]+;/g,
    `MARKETING_VERSION = ${version};`,
    "MARKETING_VERSION"
  );

  writeText(pbxprojPath, contents);
}

function main() {
  const pkg = JSON.parse(readText(packageJsonPath));
  const version = pkg.version;
  const buildNumber = getBuildNumber(version);

  syncGradleProperties(version, buildNumber);
  syncAndroidAppBuildGradle(version, buildNumber);
  syncInfoPlist(version, buildNumber);
  syncPbxproj(version, buildNumber);

  process.stdout.write(
    `Synced native versions to ${version} with build ${buildNumber}.\n`
  );
}

main();
