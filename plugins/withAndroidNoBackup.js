const { withAndroidManifest } = require('expo/config-plugins');

const APPLICATION_ATTRS = {
  'android:allowBackup': 'false',
  'android:fullBackupContent': 'false',
  'tools:replace': 'android:allowBackup,android:fullBackupContent',
};

module.exports = function withAndroidNoBackup(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];

    if (!manifest.$) {
      manifest.$ = {};
    }
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    if (application) {
      application.$ = {
        ...application.$,
        ...APPLICATION_ATTRS,
      };
    }

    return config;
  });
};
