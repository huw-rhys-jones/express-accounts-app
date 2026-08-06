const { getDefaultConfig } = require("expo/metro-config");
const exclusionList = require("@expo/metro/metro-config/defaults/exclusionList").default;

const config = getDefaultConfig(__dirname);

// 1. Add cjs support (as you had)
config.resolver.assetExts.push("cjs");

// 2. Enable Package Exports (Required for many SDK 54 libraries)
config.resolver.unstable_enablePackageExports = true;

// Metro's own integration tests do not belong in the app watch graph.
// Generated Android output is not source code and must not be watched.
config.resolver.blockList = exclusionList([
  /.*\/node_modules\/metro\/src\/integration_tests\/.*$/,
  /.*\/android\/app\/build\/.*$/,
  /.*\/android\/build\/.*$/,
]);

module.exports = config;