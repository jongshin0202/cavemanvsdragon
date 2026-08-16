import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.8ca556b9b5b4491080b1d14db143f4d8',
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
