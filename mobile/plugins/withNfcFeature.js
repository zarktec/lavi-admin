const { withAndroidManifest } = require("@expo/config-plugins");

// Declara que la app requiere hardware NFC: Google Play no la ofrece a teléfonos sin NFC.
module.exports = function withNfcFeature(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest["uses-feature"] = manifest["uses-feature"] ?? [];
    if (!manifest["uses-feature"].some((f) => f.$["android:name"] === "android.hardware.nfc")) {
      manifest["uses-feature"].push({ $: { "android:name": "android.hardware.nfc", "android:required": "true" } });
    }
    return c;
  });
};
