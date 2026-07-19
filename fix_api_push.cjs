const fs = require('fs');

let api = fs.readFileSync('src/lib/api.ts', 'utf8');

// Ensure sendFCMBroadcast and sendFCMPushToFlat are imported
if (!api.includes('sendFCMBroadcast') || !api.includes('sendFCMPushToFlat')) {
  api = api.replace(
    /import \{\s*subscribeToComplaints,/,
    "import { sendFCMBroadcast, sendFCMPushToFlat, subscribeToComplaints,"
  );
}

// 1. Complaint Posted
api = api.replace(
  /createComplaint: async \(payload.*?\) => \{/,
  `createComplaint: async (payload: any) => {
    // Notify admin or broadcast that a new complaint was posted
    if (typeof window !== 'undefined') {
      import('./firebase').then(({ sendFCMBroadcast }) => {
         sendFCMBroadcast({
           title: \`🚨 New Complaint Raised\`,
           body: \`A new complaint has been posted by Flat \${payload.flatId}.\`,
           icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'
         }).catch(console.error);
      });
    }`
);

// 2. Financial Ledger Upload
api = api.replace(
  /createFinancialReport: async \(payload.*?\) => \{/,
  `createFinancialReport: async (payload: any) => {
    if (typeof window !== 'undefined') {
      import('./firebase').then(({ sendFCMBroadcast }) => {
         sendFCMBroadcast({
           title: \`💰 New Financial Ledger Uploaded\`,
           body: \`A new financial ledger document "\${payload.title}" has been uploaded.\`,
           icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'
         }).catch(console.error);
      });
    }`
);

// 3. Amenities Booking Registered
api = api.replace(
  /createAmenityBooking: async \(payload.*?\) => \{/,
  `createAmenityBooking: async (payload: any) => {
    if (typeof window !== 'undefined') {
      import('./firebase').then(({ sendFCMBroadcast }) => {
         sendFCMBroadcast({
           title: \`📅 New Amenity Booking\`,
           body: \`Flat \${payload.flatId} has requested a new booking for \${payload.amenityType}.\`,
           icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'
         }).catch(console.error);
      });
    }`
);

fs.writeFileSync('src/lib/api.ts', api);

// ProfileSection.tsx: "if Flat is registered from other flat to take their flat orders/deliveries and all during their absence pls..."
let pf = fs.readFileSync('src/components/resident/ProfileSection.tsx', 'utf8');
if (!pf.includes('sendFCMPushToFlat')) {
  pf = pf.replace(/import \{ updateDoc, doc, db/, "import { updateDoc, doc, db, sendFCMPushToFlat");
}
pf = pf.replace(
  /setAbsenceSuccess\('Absence settings saved successfully.'\);/,
  `setAbsenceSuccess('Absence settings saved successfully.');
      if (form.deliveriesTo) {
        const parts = form.deliveriesTo.split('-');
        if (parts.length === 2) {
          sendFCMPushToFlat(parts[0], parseInt(parts[1], 10), {
            title: \`📦 Delivery Delegate Notice\`,
            body: \`Flat \${flatKey} has marked you as their delegate for deliveries/orders during their absence.\`,
            icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'
          }).catch(console.warn);
        }
      }`
);
fs.writeFileSync('src/components/resident/ProfileSection.tsx', pf);
