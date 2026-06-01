import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qrattend.pro',
  appName: 'QRAttend Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,           // Allow HTTP in development
  },
  plugins: {
    Camera: {
      permissionType: 'camera',
      allowEditing: false,
      saveToGallery: false,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#f8fafc',
      showSpinner: true,
      spinnerColor: '#4f46e5',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    allowMixedContent: true,
  },
  // ios: {
  //   contentInsetAdjustmentBehavior: 'automatic',
  // },
};

export default config;