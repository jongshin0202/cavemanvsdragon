import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.team2go.cavemanvsdragon',
  appName: 'Caveman Vs Dragon',
  webDir: 'dist',
  android: {
    // Preserve the verified self-contained APK behavior and disallow cleartext traffic.
    allowMixedContent: false,
  },
};

export default config;
