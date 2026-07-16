const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'server-db.json');
if (fs.existsSync(dbPath)) {
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const resetData = {
    owners: data.owners || [],
    passwords: data.passwords || {},
    essential_contacts: data.essential_contacts || [],
    visitors: [],
    notifications: [],
    society_notifications: [],
    announcements: [],
    complaints: [],
    financial_reports: [],
    amenities_bookings: [],
    gym_theatre_logs: [],
    movies_schedule: [],
    daily_helpers: [],
    sos_alerts: [],
    absence_logs: []
  };
  fs.writeFileSync(dbPath, JSON.stringify(resetData, null, 2), 'utf8');
  console.log('Database wiped successfully.');
} else {
  console.log('No server-db.json found, skipping wipe.');
}
