/**
 * Firebase Messaging & Background Sync Service Worker
 * Orchid Heights Apartment Management System
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
        } else if (change.type === 'removed') {
          const docId = change.doc.id;
          console.log(`[SW] Visitor ${docId} resolved elsewhere. Auto-dismissing notification.`);
          // Get any active notification with this visitor's tag and close it
          if (self.registration.getNotifications) {
            self.registration.getNotifications({ tag: docId }).then(notifications => {
              notifications.forEach(notification => notification.close());
            }).catch(err => {
              console.warn('[SW] Failed to auto-dismiss resolved notification:', err);
            });
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
          const timestamp = ann.timestamp || new Date().toISOString();
          const ageMs = Date.now() - new Date(timestamp).getTime();
          const isFresh = ageMs < 5 * 60 * 1000;
          
          let shouldNotify = false;
          const targetType = (ann.target || 'all').toLowerCase();
          if (targetType === 'all') shouldNotify = true;
          if (targetType === 'wing' && ann.wing && ann.wing.toUpperCase() === wing.toUpperCase()) shouldNotify = true;
          if (targetType === 'flat' && ann.wing && ann.wing.toUpperCase() === wing.toUpperCase() && Number(ann.flatNo) === Number(flatNo)) shouldNotify = true;

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
          const timestamp = fin.createdAt || new Date().toISOString();
          const ageMs = Date.now() - new Date(timestamp).getTime();
          const isFresh = ageMs < 5 * 60 * 1000;
          
          if (!notifiedIds.has(docId) && isFresh) {
            notifiedIds.add(docId);
            self.registration.showNotification(`💰 Financial Ledger Update`, {
              body: `New ${fin.reportType || 'report'}: ${fin.title} - ₹${fin.totalExpense || 0}`,
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
  const type = payload.data?.type || 'visitor';
  
  const options = {
    body,
    icon,
    badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
    data: payload.data || {},
    requireInteraction: type === 'visitor'
  };

  if (type === 'visitor') {
    options.actions = [
      { action: 'approve', title: '✅ Approve' },
      { action: 'reject', title: '❌ Reject' }
    ];
  }

  self.registration.showNotification(title, options);
});

// Native push listener for instant background wake-up and reliable display
self.addEventListener('push', function(event) {
  console.log('[SW Native Push] Push event received:', event);

  if (!event.data) {
    console.warn('[SW Native Push] Push event has no data payload.');
    return;
  }

  try {
    const rawPayload = event.data.json();
    console.log('[SW Native Push] Parsed raw payload:', rawPayload);

    // FCM payloads sent via HTTP v1 wraps parameters inside a message object or in root
    const message = rawPayload.message || rawPayload;
    const notification = message.notification || {};
    const data = message.data || {};

    const title = notification.title || rawPayload.title || 'Orchid Heights Gatekeeper';
    const body = notification.body || rawPayload.body || rawPayload.message || 'New gatekeeper notification received.';
    const icon = notification.image || notification.icon || rawPayload.icon || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png';
    const type = data.type || rawPayload.type || 'society';
    const visitorId = data.visitorId || rawPayload.visitorId || data.id || rawPayload.id;

    // Use unique tag to avoid duplicate stack listings
    const tag = visitorId || type || 'fcm_notif';

    const options = {
      body: body,
      icon: icon,
      badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
      tag: tag,
      data: data,
      requireInteraction: type === 'visitor_request' || type === 'visitor'
    };

    if (type === 'visitor_request' || type === 'visitor') {
      options.actions = [
        { action: 'approve', title: '✅ Approve' },
        { action: 'reject', title: '❌ Reject' }
      ];
    }

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('[SW Native Push] Error parsing push data payload:', err);
    event.waitUntil(
      self.registration.showNotification('Orchid Heights Update', {
        body: 'New gatekeeper notification received.',
        icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
        badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
        tag: 'fcm_notif_err'
      })
    );
  }
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
  
  const visitorId = event.notification.data?.visitorId || event.notification.data?.id || event.notification.tag;
  const action = event.action;

  if (action === 'approve' || action === 'reject') {
    const status = action === 'approve' ? 'approved' : 'rejected';
    console.log(`[SW] Action clicked: ${action}. Target Visitor: ${visitorId}`);

    if (!visitorId || visitorId === 'fcm_notif') {
      console.warn('[SW] Mismatched or invalid visitorId tag, skipping database transaction.');
      return;
    }

    const visitorRef = db.collection('visitors').doc(visitorId);
    const notificationRef = db.collection('notifications').doc(visitorId);

    const updatePromise = db.runTransaction((transaction) => {
      return transaction.get(visitorRef).then((visitorDoc) => {
        if (!visitorDoc.exists) {
          throw new Error("Visitor document does not exist");
        }

        const visitorData = visitorDoc.data();
        // Prevent double response if another device already responded
        if (visitorData.status !== 'pending') {
          console.log(`[SW] Visitor ${visitorId} already responded: ${visitorData.status}. Skipping.`);
          return;
        }

        const respondedTime = new Date().toISOString();
        const respondedBy = 'Resident (via Notification)';
        const rejectReason = '';

        const updatedVisitor = {
          ...visitorData,
          status: status,
          respondedTime: respondedTime,
          respondedBy: respondedBy,
          rejectReason: rejectReason
        };

        transaction.set(visitorRef, updatedVisitor);
        transaction.set(notificationRef, {
          status: status,
          respondedTime: respondedTime,
          respondedBy: respondedBy,
          rejectReason: rejectReason
        }, { merge: true });

        // Query society notifications matching this visitorId
        return db.collection('society_notifications')
          .where('metadata.visitorId', '==', visitorId)
          .get()
          .then((notifSnap) => {
            notifSnap.forEach((docSnap) => {
              const notifData = docSnap.data();
              const newTitle = `🚪 Gate Visitor: ${visitorData.fullName} (${status.toUpperCase()})`;
              const newMsg = status === 'approved'
                ? `Visitor ${visitorData.fullName} (${visitorData.guestType}) was APPROVED for entry to Flat ${visitorData.wing}-${visitorData.flatNo} by ${respondedBy} for ${visitorData.reason}.`
                : `Visitor ${visitorData.fullName} (${visitorData.guestType}) was REJECTED for entry to Flat ${visitorData.wing}-${visitorData.flatNo} by ${respondedBy}.${rejectReason ? ' Reason: ' + rejectReason : ''}`;
              
              transaction.set(db.collection('society_notifications').doc(docSnap.id), {
                title: newTitle,
                message: newMsg,
                status: status,
                metadata: {
                  ...notifData.metadata,
                  status: status,
                  respondedTime: respondedTime,
                  respondedBy: respondedBy,
                  rejectReason: rejectReason
                }
              }, { merge: true });
            });
          });
      });
    }).then(() => {
      console.log(`[SW] Successfully transaction-updated visitor ${visitorId} to status: ${status}`);
    }).catch(err => {
      console.error('[SW] Transaction failed to update visitor status:', err);
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
