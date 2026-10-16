import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.veetrag.pitwall',
  appName: 'Pit Wall',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    // Light status/navigation-bar icons on the dark ground. Capacitor's naming
    // is inverted: "DARK" means content for a DARK background, i.e. light
    // icons. The default ("DEFAULT") follows the phone's theme, which gave
    // dark icons on a phone in light mode. Pinned by tests/data/systemBars.test.ts.
    SystemBars: {
      style: 'DARK',
    },
  },
}

export default config
