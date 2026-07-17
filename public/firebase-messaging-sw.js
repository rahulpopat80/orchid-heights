/**
 * Firebase Messaging Service Worker
 * Orchid Heights Apartment Management System
 *
 * HOW BACKGROUND NOTIFICATIONS WORK (Like WhatsApp/Instagram):
 * 1. FCM server sends a push to the device via Google's cloud
 * 2. Android/Chrome OS wakes up this service worker file in the background
 * 3. This file catches the push via messaging.onBackgroundMessage + native 'push' listener
 * 4. It shows the notification in the system tray immediately
 * 5. NO app open required at all - exactly like WhatsApp
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAHHKnOR_UkAjDQ8wFdBpVALYrY1rPK3Es",
  authDomain: "orchidheights-d46f2.firebaseapp.com",
  projectId: "orchidheights-d46f2",
  storageBucket: "orchidheights-d46f2.firebasestorage.app",
  messagingSenderId: "408063641296",
  appId: "1:408063641296:web:c0d1b7e79c69681704c0d5"
});

const messaging = firebase.messaging();
const db = firebase.firestore();

// ─── INSTALL & ACTIVATE ──────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] Installing new service worker version...');
  // Skip waiting so new SW activates immediately without needing a page refresh
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated. Taking control of all clients...');
  // claim() makes SW control all open pages immediately
  event.waitUntil(clients.claim());
});

// ─── FCM BACKGROUND MESSAGE HANDLER ─────────────────────────────────────────
// This fires when a push arrives while app is CLOSED or in BACKGROUND
// This is the PRIMARY handler for ALL notifications

messaging.onBackgroundMessage((payload) => {
  console.log('[SW FCM] Background message received:', payload);
  
  const data = payload.data || {};
  const fcmNotif = payload.notification || {};
  
  const title = fcmNotif.title || data.title || '🏢 Orchid Heights';
  const body = fcmNotif.body || data.body || data.message || 'You have a new notification.';
  const icon = data.icon || fcmNotif.image || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png';
  const type = data.type || 'society';
  const visitorId = data.visitorId || data.id || null;
  const tag = visitorId || data.tag || type || 'orchid_notif';

  const notifOptions = {
    body: body,
    icon: icon,
    badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
    tag: tag,
    data: data,
    requireInteraction: type === 'visitor' || type === 'visitor_request',
    vibrate: [200, 100, 200]
  };

  // Add Approve/Reject actions only for visitor notifications
  if (type === 'visitor' || type === 'visitor_request') {
    notifOptions.actions = [
      { action: 'approve', title: '✅ Approve Entry' },
      { action: 'reject', title: '❌ Reject' }
    ];
  }

  return self.registration.showNotification(title, notifOptions);
});

// ─── NATIVE PUSH FALLBACK HANDLER ────────────────────────────────────────────
// This catches push events that FCM SDK might miss (e.g. on some Android browsers)
// Acts as a 100% reliable fallback

self.addEventListener('push', (event) => {
  // Let FCM SDK handle if it already processed this
  // Only handle if we have data and FCM SDK missed it
  if (!event.data) {
    console.log('[SW Native Push] Push with no data received, ignoring.');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    try {
      // Try reading as text if JSON parse fails
      const text = event.data.text();
      payload = { notification: { title: 'Orchid Heights', body: text }, data: {} };
    } catch (e2) {
      console.warn('[SW Native Push] Could not parse push data');
      return;
    }
  }

  // Extract notification data - handle both FCM v1 format and raw format
  const fcmData = payload.data || {};
  const fcmNotif = payload.notification || {};

  const title = fcmNotif.title || fcmData.title || '🏢 Orchid Heights';
  const body = fcmNotif.body || fcmData.body || fcmData.message || 'You have a new notification.';
  const icon = fcmData.icon || fcmNotif.image || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png';
  const type = fcmData.type || 'society';
  const visitorId = fcmData.visitorId || fcmData.id || null;
  const tag = visitorId || fcmData.tag || type || 'orchid_notif';

  const notifOptions = {
    body: body,
    icon: icon,
    badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
    tag: tag,
    data: fcmData,
    requireInteraction: type === 'visitor' || type === 'visitor_request',
    vibrate: [200, 100, 200]
  };

  if (type === 'visitor' || type === 'visitor_request') {
    notifOptions.actions = [
      { action: 'approve', title: '✅ Approve Entry' },
      { action: 'reject', title: '❌ Reject' }
    ];
  }

  // Use waitUntil so the browser waits for the notification to be shown
  event.waitUntil(
    // Check if FCM SDK already showed this notification to avoid duplicate
    self.registration.getNotifications({ tag: tag }).then((existing) => {
      if (existing.length === 0) {
        console.log('[SW Native Push] Showing notification (FCM SDK did not handle):', title);
        return self.registration.showNotification(title, notifOptions);
      } else {
        console.log('[SW Native Push] FCM SDK already showed notification, skipping duplicate.');
      }
    })
  );
});

// ─── NOTIFICATION CLICK HANDLER ──────────────────────────────────────────────

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const notifData = event.notification.data || {};
  const visitorId = notifData.visitorId || notifData.id || event.notification.tag;
  const action = event.action;

  console.log(`[SW] Notification clicked. Action: "${action}", VisitorId: "${visitorId}"`);

  if ((action === 'approve' || action === 'reject') && visitorId && visitorId !== 'fcm_notif' && visitorId !== 'society' && visitorId !== 'visitor') {
    const status = action === 'approve' ? 'approved' : 'rejected';
    console.log(`[SW] Processing visitor ${action} for ID: ${visitorId}`);

    const visitorRef = db.collection('visitors').doc(visitorId);

    const updatePromise = db.runTransaction((transaction) => {
      return transaction.get(visitorRef).then((visitorDoc) => {
        if (!visitorDoc.exists) {
          console.warn('[SW] Visitor document not found:', visitorId);
          return;
        }

        const visitorData = visitorDoc.data();
        
        // Prevent double-response if another device already acted
        if (visitorData.status !== 'pending') {
          console.log(`[SW] Visitor already responded (${visitorData.status}). Skipping.`);
          return;
        }

        const respondedTime = new Date().toISOString();
        const respondedBy = 'Resident (Notification)';

        transaction.set(visitorRef, {
          ...visitorData,
          status: status,
          respondedTime: respondedTime,
          respondedBy: respondedBy,
          rejectReason: ''
        });

        // Also update notifications collection
        transaction.set(db.collection('notifications').doc(visitorId), {
          status: status,
          respondedTime: respondedTime,
          respondedBy: respondedBy
        }, { merge: true });
      });
    }).then(() => {
      console.log(`[SW] Successfully updated visitor ${visitorId} → ${status}`);
    }).catch(err => {
      console.error('[SW] Transaction failed:', err);
    });

    // Broadcast to open app tabs
    const broadcastPromise = clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      clientList.forEach(client => {
        client.postMessage({ type: 'VISITOR_ACTION', visitorId, status });
      });
    });

    event.waitUntil(Promise.all([updatePromise, broadcastPromise]));

  } else {
    // Normal click - focus or open the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow('/?activeTab=resident');
      })
    );
  }
});

// ─── SESSION SYNC ─────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'USER_SESSION_UPDATED') {
    console.log('[SW] Session updated by app. Caching session data.');
  }
});
