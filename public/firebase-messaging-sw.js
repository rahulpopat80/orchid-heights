/**
 * Firebase Messaging & Background Sync Service Worker
 * Orchid Heights Apartment Management System
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyARuaG8wXchD_21vQQcgMkBam1eFpDyn7w",
  authDomain: "elaborate-valor-f2t1j.firebaseapp.com",
  projectId: "elaborate-valor-f2t1j",
  storageBucket: "elaborate-valor-f2t1j.firebasestorage.app",
  messagingSenderId: "193733254976",
  appId: "1:193733254976:web:8ba04c424389e3dd1fa4a5"
});

const messaging = firebase.messaging();
const db = firebase.firestore();

let activeUnsubscribe = null;
const notifiedIds = new Set();

// Check Cache Storage and setup background listeners for visitors
function syncBackgroundListeners() {
  if (typeof caches === 'undefined') return;

  caches.open('orchid-user-cache')
    .then(cache => cache.match('/current-user.json'))
    .then(response => {
      if (!response) {
        console.log('[SW] No cached session found. Stopping background listener.');
        if (activeUnsubscribe) {
          activeUnsubscribe();
          activeUnsubscribe = null;
        }
        return;
      }
      return response.json();
    })
    .then(session => {
      if (!session || !session.wing || !session.flatNo) {
        return;
      }
      setupVisitorListener(session.wing, session.flatNo);
    })
    .catch(err => {
      console.warn('[SW] Error syncing background listeners:', err);
    });
}

// Subscribe to real-time visitors for the specific flat in the background
function setupVisitorListener(wing, flatNo) {
  if (activeUnsubscribe && Array.isArray(activeUnsubscribe)) {
    activeUnsubscribe.forEach(u => u());
  } else if (activeUnsubscribe) {
    activeUnsubscribe();
  }
  activeUnsubscribe = [];

  console.log(`[SW] Starting background visitor snapshot listener for flat ${wing}-${flatNo}`);

  activeUnsubscribe.push(db.collection('visitors')
    .where('wing', '==', wing.toUpperCase())
    .where('flatNo', '==', Number(flatNo))
    .where('status', '==', 'pending')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const visitor = change.doc.data();

          // Use requestTime (the actual field stored in visitors collection)
          const timestamp = visitor.requestTime || visitor.createdAt || new Date().toISOString();
          const ageMs = Date.now() - new Date(timestamp).getTime();
          // 5 minute freshness window to account for time drift
          const isFresh = ageMs < 5 * 60 * 1000;

          if (!notifiedIds.has(docId) && isFresh) {
            notifiedIds.add(docId);
            
            const title = `🚪 ગેટ પર મુલાકાતી: ${visitor.fullName}`;
            const body = `${visitor.guestType} | ${visitor.mobileNumber}\nFlat ${visitor.wing}-${visitor.flatNo} | ${visitor.reason}`;
            const icon = visitor.photoUrl || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png';

            self.registration.showNotification(title, {
              body,
              icon,
              badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
              tag: docId,
              requireInteraction: true,
              data: { visitorId: docId, wing, flatNo, type: 'visitor_request' },
              actions: [
                { action: 'approve', title: '✅ Approve Entry' },
                { action: 'reject', title: '❌ Reject' }
              ]
            });
          } else {
            notifiedIds.add(docId);
          }
        }
      });
    }, err => {
      console.error('[SW] Firestore background snapshot listener error:', err);
    }));


  activeUnsubscribe.push(db.collection('announcements')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const ann = change.doc.data();
          const isFresh = (Date.now() - new Date(ann.timestamp || Date.now()).getTime()) < 60000;
          
          let shouldNotify = false;
          if (ann.target === 'all') shouldNotify = true;
          if (ann.target === 'wing' && ann.wing === wing) shouldNotify = true;
          if (ann.target === 'flat' && ann.wing === wing && ann.flatNo === Number(flatNo)) shouldNotify = true;

          if (shouldNotify && !notifiedIds.has(docId) && isFresh) {
            notifiedIds.add(docId);
            self.registration.showNotification(`📢 Notice: ${ann.sender || 'Admin'}`, {
              body: ann.text,
              icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
              tag: docId,
              data: { url: '/?activeTab=resident' }
            });
          } else {
            notifiedIds.add(docId);
          }
        }
      });
    }));

  activeUnsubscribe.push(db.collection('financial_reports')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const fin = change.doc.data();
          const isFresh = (Date.now() - new Date(fin.date || fin.createdAt || Date.now()).getTime()) < 60000;
          
          if (!notifiedIds.has(docId) && isFresh) {
            notifiedIds.add(docId);
            self.registration.showNotification(`💰 Financial Ledger Update`, {
              body: `New ${fin.type}: ${fin.title} - ₹${fin.amount}`,
              icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
              tag: docId,
              data: { url: '/?activeTab=resident' }
            });
          } else {
            notifiedIds.add(docId);
          }
        }
      });
    }));

  activeUnsubscribe.push(db.collection('complaints')
    .where('wing', '==', wing)
    .where('flatNo', '==', Number(flatNo))
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified') {
          const docId = change.doc.id;
          const comp = change.doc.data();
          if (comp.status === 'resolved' && !notifiedIds.has(docId + '-resolved')) {
            notifiedIds.add(docId + '-resolved');
            self.registration.showNotification(`✅ Complaint Resolved`, {
              body: `Your complaint "${comp.title}" has been marked as resolved!`,
              icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
              tag: docId,
              data: { url: '/?activeTab=resident' }
            });
          }
        }
      });
    }));
}

// FCM standard background messages support
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] FCM Background notification received:', payload);
  const title = payload.notification?.title || '🚪 New Visitor Request';
  const body = payload.notification?.body || 'A visitor is waiting at the gate for approval!';
  const icon = payload.notification?.image || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png';
  
  self.registration.showNotification(title, {
    body,
    icon,
    badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
    data: payload.data || {},
    requireInteraction: true,
    actions: [
      { action: 'approve', title: '✅ Approve' },
      { action: 'reject', title: '❌ Reject' }
    ]
  });
});

// Sync listeners on startup and registration events
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    clients.claim().then(() => {
      syncBackgroundListeners();
    })
  );
});

// Periodic background check to keep subscription fresh
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'USER_SESSION_UPDATED') {
    console.log('[SW] Session update event received. Re-syncing background listener.');
    syncBackgroundListeners();
  }
});

// Handle notifications actions and click events
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const visitorId = event.notification.data?.visitorId || event.notification.data?.id;
  const action = event.action;

  if (action === 'approve' || action === 'reject') {
    const status = action === 'approve' ? 'approved' : 'rejected';
    
    // Write directly to Firestore from the service worker background thread!
    const updatePromise = db.collection('visitors').doc(visitorId).update({
      status: status,
      respondedAt: new Date().toISOString()
    }).then(() => {
      console.log(`[SW] Background successfully updated visitor ${visitorId} to status: ${status}`);
    }).catch(err => {
      console.error('[SW] Failed to update visitor status from background worker:', err);
    });

    // Broadcast status change to any active browser client tabs
    const broadcastPromise = clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('postMessage' in client) {
          client.postMessage({
            type: 'VISITOR_ACTION',
            visitorId: visitorId,
            status: status
          });
        }
      }
      
      // Focus or open the browser window to resident section
      if (clients.openWindow) {
        return clients.openWindow('/?activeTab=resident');
      }
    });

    event.waitUntil(Promise.all([updatePromise, broadcastPromise]));
  } else {
    // Standard click on notification body - focus/open application
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/?activeTab=resident');
        }
      })
    );
  }
});

// Try to trigger background checks on wake-up
syncBackgroundListeners();
