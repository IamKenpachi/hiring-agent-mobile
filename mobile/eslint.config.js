// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*"],
  },
  {
    rules: {
      // React Native <Text> does not decode HTML entities like &apos;.
      "react/no-unescaped-entities": "off",
      // Stylistic choice between Array<T> and T[].
      "@typescript-eslint/array-type": "off",
    },
  },
]);
