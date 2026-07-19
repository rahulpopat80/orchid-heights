const fs = require('fs');

let fb = fs.readFileSync('src/lib/firebase.ts', 'utf8');
fb = fb.replace(
  /await sendFCMPushToFlat\(wing, flatNo, \{\s*title: payload.title,\s*body: payload.message,\s*data: \{ type: payload.type \}\s*\}\);/,
  `await sendFCMPushToFlat(wing, flatNo, {
          title: payload.title,
          body: payload.message,
          icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
          data: { type: payload.type }
        });`
);
fs.writeFileSync('src/lib/firebase.ts', fb);

let ad = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf8');

// Add notifications for Admin Dashboard actions
if (!ad.includes('sendFCMBroadcast')) {
  ad = ad.replace(/import \{ collection/, "import { sendFCMBroadcast, sendFCMPushToFlat, collection");
}

ad = ad.replace(
  /await addDoc\(collection\(db, 'announcements'\), newNotice\);/,
  `await addDoc(collection(db, 'announcements'), newNotice);
      sendFCMBroadcast({ 
        title: \`📢 New Society Notice: \${noticeTitle}\`, 
        body: \`A new notice has been uploaded by the Administrator.\`,
        icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'
      }).catch(console.error);`
);

ad = ad.replace(
  /await addDoc\(collection\(db, 'movies'\), newMovie\);/,
  `await addDoc(collection(db, 'movies'), newMovie);
      sendFCMBroadcast({ 
        title: \`🎬 New Movie Scheduled: \${newMovie.title}\`, 
        body: \`\${newMovie.title} has been scheduled for \${newMovie.date} at \${newMovie.time}.\`,
        icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'
      }).catch(console.error);`
);

ad = ad.replace(
  /await updateDoc\(doc\(db, 'complaints', id\), \{ status \}\);/,
  `await updateDoc(doc(db, 'complaints', id), { status });
        const comp = complaints.find(c => c.id === id);
        if (comp) sendFCMPushToFlat(comp.wing, comp.flatNo, { 
          title: \`✅ Complaint Reviewed\`, 
          body: \`Your complaint "\${comp.title}" is now \${status}.\`,
          icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'
        }).catch(console.error);`
);

fs.writeFileSync('src/components/AdminDashboard.tsx', ad);

let rd = fs.readFileSync('src/components/ResidentDashboard.tsx', 'utf8');
if (!rd.includes('sendFCMPushToFlat') && rd.includes('submitComplaint')) {
  rd = rd.replace(/import \{ db, addDoc/, "import { db, addDoc, sendFCMPushToFlat"); // Note: ResidentDashboard doesn't actually use sendFCMPushToFlat itself, wait, it might.
}
// Actually, it's better to trigger these from the backend/firebase.ts api functions!
