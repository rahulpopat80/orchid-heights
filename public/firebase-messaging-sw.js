/**
 * Firebase Messaging Service Worker
 * Orchid Heights Apartment Management System
 */

// ─── 1. INTERCEPT NATIVE PUSH EVENT FIRST ──────────────────────────────────
// We attach this BEFORE importing Firebase SDKs so it fires first.
// We then call stopImmediatePropagation() to PREVENT the Firebase SDK from
// hijacking the notification. This gives us 100% control over the display,
// allowing us to add custom Approve/Reject buttons reliably.

self.addEventListener('push', (event) => {
  // STOP the Firebase Messaging SDK from seeing this push event!
  event.stopImmediatePropagation();
  
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    try {
      payload = { notification: { title: 'Orchid Heights', body: event.data.text() }, data: {} };
    } catch (e2) {
      return;
    }
  }

  const fcmData = payload.data || {};
  const fcmNotif = payload.notification || {};
  // FCM v1 sometimes wraps in message payload
  const message = payload.message || {};
  const actualData = message.data || fcmData;
  const actualNotif = message.notification || fcmNotif;

  const title = actualNotif.title || actualData.title || '🏢 Orchid Heights';
  const body = actualNotif.body || actualData.body || actualData.message || 'You have a new notification.';
  const icon = actualData.icon || actualNotif.image || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png';
  const type = actualData.type || 'society';
  const visitorId = actualData.visitorId || actualData.id || null;
  const tag = visitorId || actualData.tag || type || 'orchid_notif';

  const notifOptions = {
    body: body,
    icon: icon,
    badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
    tag: tag,
    data: actualData,
    requireInteraction: type === 'visitor' || type === 'visitor_request',
    vibrate: [200, 100, 200]
  };

  if (type === 'visitor' || type === 'visitor_request') {
    notifOptions.actions = [
      { action: 'approve', title: '✅ Approve Entry' },
      { action: 'reject', title: '❌ Reject' }
    ];
  }

  event.waitUntil(
    self.registration.showNotification(title, notifOptions)
  );
});

// ─── 2. LOAD FIREBASE SDKS (AFTER PUSH LISTENER) ─────────────────────────

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
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated. Taking control of all clients...');
  event.waitUntil(clients.claim());
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
