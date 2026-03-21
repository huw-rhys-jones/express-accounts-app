const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// 1. Add cjs support (as you had)
config.resolver.assetExts.push("cjs");

// 2. Enable Package Exports (Required for many SDK 54 libraries)
config.resolver.unstable_enablePackageExports = true;

// 3. Force Metro to look at the root node_modules if it gets lost
config.resolver.nodeModulesPaths = [
  require('path').resolve(__dirname, 'node_modules'),
];

module.exports = config;