import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.donkeykong',
  appName: 'Donkey Kong',
  webDir: 'dist',
  server: {
    url: 'https://8ca556b9-b5b4-4910-80b1-d14db143f4d8.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
