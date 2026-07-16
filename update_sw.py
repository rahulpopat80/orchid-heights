import re

path = 'public/firebase-messaging-sw.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add the active subscriptions array to track them
content = content.replace('let activeUnsubscribe = null;', 'let activeUnsubscribe = [];')
content = content.replace('if (activeUnsubscribe) {\n    activeUnsubscribe();\n  }', 'if (activeUnsubscribe) {\n    activeUnsubscribe.forEach(u => u());\n    activeUnsubscribe = [];\n  }')

# Replace the specific activeUnsubscribe assignment
content = content.replace('activeUnsubscribe = db.collection(''visitors'')', 'activeUnsubscribe.push(db.collection(''visitors'')')

new_listeners = """
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const visitor = change.doc.data();

          // Ensure we don't alert for old records on initial snapshot load
          const isFresh = (Date.now() - new Date(visitor.requestTime || Date.now()).getTime()) < 60000;

          if (!notifiedIds.has(docId) && isFresh) {
            notifiedIds.add(docId);
            
            const title = ?? New Visitor: ;
            const body = Guest Type: \\nWing-Flat: -\\nReason: ;
            const icon = visitor.photoUrl || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png';

            self.registration.showNotification(title, {
              body,
              icon,
              badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
              tag: docId,
              requireInteraction: true,
              data: { visitorId: docId, wing, flatNo },
              actions: [
                { action: 'approve', title: '? Approve' },
                { action: 'reject', title: '? Reject' }
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

  // Announcements Listener
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
            self.registration.showNotification(?? Notice: , {
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

  // Financial Reports Listener
  activeUnsubscribe.push(db.collection('financial_reports')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          const fin = change.doc.data();
          const isFresh = (Date.now() - new Date(fin.date || fin.createdAt || Date.now()).getTime()) < 60000;
          
          if (!notifiedIds.has(docId) && isFresh) {
            notifiedIds.add(docId);
            self.registration.showNotification(?? Financial Ledger Update, {
              body: New :  - ?,
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

  // Complaints Updates Listener
  activeUnsubscribe.push(db.collection('complaints')
    .where('wing', '==', wing)
    .where('flatNo', '==', Number(flatNo))
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified') {
          const docId = change.doc.id;
          const comp = change.doc.data();
          // We only alert on status change to 'resolved'
          if (comp.status === 'resolved' && !notifiedIds.has(docId + '-resolved')) {
            notifiedIds.add(docId + '-resolved');
            self.registration.showNotification(? Complaint Resolved, {
              body: Your complaint "" has been marked as resolved!,
              icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
              tag: docId,
              data: { url: '/?activeTab=resident' }
            });
          }
        }
      });
    }));
"""

# Replace the block from .onSnapshot to the end of setupVisitorListener
import re
content = re.sub(r'\.onSnapshot\(snapshot => \{.*?\}\);', new_listeners, content, flags=re.DOTALL)

# Ensure there's no dangling parenthesis from the replacement
content = content.replace("}));\n\n  // Announcements", ");\n\n  // Announcements")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Service worker updated with comprehensive FCM fallback listeners.')
