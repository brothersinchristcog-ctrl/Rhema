const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Adds WhatsApp / WhatsApp Business `<queries>` entries into a parsed AndroidManifest object
 * idempotently for Android 11+ (API 30+) package visibility.
 */
function applyWhatsAppAndroidManifestQueries(manifest) {
  if (!manifest.queries || !Array.isArray(manifest.queries) || manifest.queries.length === 0) {
    manifest.queries = [{}];
  }

  const queriesEntry = manifest.queries[0];
  if (!Array.isArray(queriesEntry.package)) {
    queriesEntry.package = [];
  }

  for (const pkgName of ['com.whatsapp', 'com.whatsapp.w4b']) {
    const exists = queriesEntry.package.some(
      (item) => item && item.$ && item.$['android:name'] === pkgName
    );
    if (!exists) {
      queriesEntry.package.push({
        $: { 'android:name': pkgName },
      });
    }
  }

  if (!Array.isArray(queriesEntry.intent)) {
    queriesEntry.intent = [];
  }
  const hasWhatsAppSchemeIntent = queriesEntry.intent.some(
    (intentItem) =>
      Array.isArray(intentItem && intentItem.data) &&
      intentItem.data.some((d) => d && d.$ && d.$['android:scheme'] === 'whatsapp')
  );
  if (!hasWhatsAppSchemeIntent) {
    queriesEntry.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': 'whatsapp' } }],
    });
  }

  return manifest;
}

/**
 * Expo config plugin injecting Android 11+ package visibility for WhatsApp deep links & shares.
 */
function withWhatsAppQueries(config) {
  return withAndroidManifest(config, (modConfig) => {
    applyWhatsAppAndroidManifestQueries(modConfig.modResults.manifest);
    return modConfig;
  });
}

withWhatsAppQueries.applyWhatsAppAndroidManifestQueries = applyWhatsAppAndroidManifestQueries;
module.exports = withWhatsAppQueries;
