import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.team2go.cavemanvsdragon',
  appName: 'cavemanvsdragon',
  webDir: 'dist',
  server: {
    url: 'https://cavemanvsdragon.vercel.app',
    cleartext: false,
  },
  android: {
    // Allow the device to rotate freely so portrait and landscape both work.
    allowMixedContent: true,
  },
};

export default config;
