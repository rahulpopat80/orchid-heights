/**
 * Orchid Heights - Firebase Configuration Settings
 * You can edit this file to connect your real Firebase project directly, 
 * or use the Setup Wizard in the Super Admin panel to save configuration dynamically.
 */

const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  vapidKey: "",       // FCM VAPID Key (Public Key)
  fcmServerKey: ""    // FCM Legacy Server Key (For client-to-client push trigger)
};

// Helper helper to get config from file or dynamic local storage
function getFirebaseConfig() {
  if (typeof localStorage !== 'undefined') {
    const dynamicConfig = localStorage.getItem('orchid_firebase_config');
    if (dynamicConfig) {
      try {
        const parsed = JSON.parse(dynamicConfig);
        if (parsed.apiKey && parsed.projectId) {
          return {
            ...parsed,
            vapidKey: localStorage.getItem('orchid_fcm_vapid_key') || FIREBASE_CONFIG.vapidKey,
            fcmServerKey: localStorage.getItem('orchid_fcm_server_key') || FIREBASE_CONFIG.fcmServerKey
          };
        }
      } catch (e) {
        console.warn("Dynamic config parsing failed", e);
      }
    }
  }
  return FIREBASE_CONFIG;
}
