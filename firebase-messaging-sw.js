/**
 * Orchid Heights - Firebase Cloud Messaging Service Worker (Production-Ready)
 * Receives background push notifications and handles interactive action buttons (Approve/Reject)
 * by updating Cloud Firestore directly from the service worker background thread.
 */

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');
importScripts('firebase-config.js');

let firebaseConfig = null;
let db = null;

// Initialize Firebase if config is already available in firebase-config.js
const fileConfig = getFirebaseConfig();
if (fileConfig && fileConfig.apiKey && fileConfig.projectId) {
  initFirebaseSW(fileConfig);
}

function initFirebaseSW(config) {
  if (firebase.apps.length === 0) {
    try {
      firebase.initializeApp(config);
      db = firebase.firestore();
      
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        console.log('[sw] Received background message:', payload);
        displayPushNotification(payload);
      });
      
      firebaseConfig = config;
      console.log('[sw] Firebase initialized successfully in Service Worker thread.');
    } catch (err) {
      console.error('[sw] Failed to initialize Firebase:', err);
    }
  } else {
    db = firebase.firestore();
    firebaseConfig = config;
  }
}

// Fallback message listener if the main thread updates dynamic configuration
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_CONFIG') {
    const config = event.data.config;
    if (config && config.apiKey && config.projectId) {
      initFirebaseSW(config);
    }
  }
});

// Intercept push events and display custom notification options
self.addEventListener('push', (event) => {
  console.log('[sw] Push Event received.');
  if (!event.data) return;

  try {
    const payload = event.data.json();
    console.log('[sw] Push payload parsed:', payload);
    
    // If the browser FCM client didn't display a notification naturally, we enforce displaying it:
    event.waitUntil(displayPushNotification(payload));
  } catch (err) {
    console.error('[sw] Error handling push event:', err);
  }
});

function displayPushNotification(payload) {
  const notificationTitle = payload.notification?.title || '🚪 New Visitor Request';
  const data = payload.data || {};
  
  const visitorName = data.visitorName || 'Guest';
  const wing = data.wing || '';
  const flat = data.flat || '';
  const reason = data.reason || 'Personal';
  const visitorsCount = data.visitorsCount || '1';
  
  const bodyText = `Flat ${wing}-${flat}: ${visitorName} (${visitorsCount} visitors)\nReason: ${reason}`;
  
  const options = {
    body: payload.notification?.body || bodyText,
    icon: data.photo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%231e3a8a"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="24">🏢</text></svg>',
    badge: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%231e3a8a"/></svg>',
    data: data,
    requireInteraction: true,
    actions: [
      { action: 'approve', title: '✅ Approve Entry' },
      { action: 'reject', title: '❌ Reject Entry' }
    ]
  };
  
  return self.registration.showNotification(notificationTitle, options);
}

// Handle notification actions (clicks on Approve or Reject)
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const notification = event.notification;
  const data = notification.data || {};
  const requestId = data.requestId;
  
  notification.close();
  
  if (!requestId) {
    console.warn('[sw] Clicked notification had no requestId data.');
    return;
  }
  
  console.log(`[sw] User clicked action: ${action} on request ${requestId}`);
  
  // Re-ensure database is initialized
  if (!db && firebaseConfig) {
    db = firebase.firestore();
  }
  
  if (!db) {
    console.error('[sw] Firestore database could not be initialized in background!');
    // Alert windows if open
    notifyWindowsOfAction(requestId, action);
    return;
  }
  
  const status = action === 'approve' ? 'approved' : 'rejected';
  
  const updateData = {
    status: status,
    answeredAt: firebase.firestore.FieldValue.serverTimestamp(),
    answeredBy: 'Owner (Push Notification)'
  };
  
  if (action === 'reject') {
    updateData.rejectionReason = 'Declined via background notification';
  }
  
  // Update Firestore directly!
  const updatePromise = db.collection('visitorRequests').doc(requestId).update(updateData)
    .then(() => {
      console.log(`[sw] Firestore successfully updated request ${requestId} to ${status}`);
      
      // Log history audit trail
      return db.collection('visitorHistory').add({
        requestId: requestId,
        visitorName: data.visitorName || 'Guest',
        wing: data.wing || '',
        flat: data.flat || '',
        status: status,
        action: action === 'approve' ? 'Approved Entry' : 'Rejected Entry',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        performedBy: 'Owner (Push Notification)'
      });
    })
    .then(() => {
      console.log('[sw] Audit history logged.');
      // Notify active tabs about this background action
      return notifyWindowsOfAction(requestId, action);
    })
    .catch((err) => {
      console.error('[sw] Error updating database directly:', err);
    });
    
  event.waitUntil(updatePromise);
});

function notifyWindowsOfAction(requestId, action) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      client.postMessage({
        type: 'NOTIFICATION_ACTION',
        action: action,
        requestId: requestId
      });
    }
    
    // Bring window to focus if approved
    if (windowClients.length > 0 && action === 'approve') {
      return windowClients[0].focus();
    }
  });
}
