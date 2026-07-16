/**
 * Orchid Heights - Apartment Gate & Resident Portal Core Application Script
 * Optimized for Production with Firebase Auth, Firestore, Storage, and FCM.
 */

// --- DYNAMIC FIREBASE INTEGRATIONS ---
let db = null;
let storage = null;
let auth = null;
let fcm = null;
let unsubscribeRequests = null;
let unsubscribeDirectory = null;

// Preset SVG Visitor avatars (Data URIs)
const PRESET_AVATARS = {
  delivery: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23cbd5e1"/><path d="M50 25 L75 42 L75 68 L50 85 L25 68 L25 42 Z" fill="%23475569"/><path d="M50 25 L75 42 L50 58 L25 42 Z" fill="%2394a3b8"/><path d="M50 58 L50 85" stroke="%2394a3b8" stroke-width="2"/><circle cx="50" cy="20" r="6" fill="%231e293b"/></svg>`,
  guest: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23eff6ff"/><circle cx="50" cy="40" r="18" fill="%231d4ed8"/><path d="M22 75 C 22 55, 78 55, 78 75 Z" fill="%231d4ed8"/><circle cx="50" cy="38" r="4" fill="%23ffffff"/></svg>`,
  electrician: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23fef3c7"/><path d="M25 80 L75 80 L70 45 L30 45 Z" fill="%23d97706"/><circle cx="50" cy="35" r="12" fill="%231e293b"/><path d="M50 15 L50 25 M43 18 L57 22" stroke="%23d97706" stroke-width="4"/></svg>`,
  milkman: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23f0fdf4"/><rect x="35" y="45" width="30" height="35" rx="3" fill="%2316a34a"/><path d="M40 45 L40 32 C40 28, 60 28, 60 32 L60 45" fill="none" stroke="%2386efac" stroke-width="4"/><circle cx="50" cy="20" r="7" fill="%2316a34a"/></svg>`,
};

// --- APP STATE ---
let state = {
  currentUser: null,       // { uid, role: 'security'|'owner'|'admin', wing, flat, name, email }
  flats: [],               // Active registry of 96 flats synced from DB
  requests: [],            // List of visitor requests
  firebaseEnabled: false,
  activeCommunityTab: 'visitors', // Active sub-panel in Resident portal
  stream: null,            // Webcam stream object
  selectedAvatar: 'delivery',
  capturedPhoto: '',
  editingFlat: null,       // Flat details being edited by Admin
  soundVolume: 1.0
};

// --- AUDIO SYNTHESIZER chimes (Web Audio API) ---
const soundSynth = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  play(type) {
    try {
      this.init();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);
      
      const now = this.ctx.currentTime;
      
      if (type === 'new-request') { // Ding-Dong chime
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.setValueAtTime(440.00, now + 0.3); // A4
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        
        osc1.start(now);
        osc1.stop(now + 1.2);
        this.showIndicator("🔔 Visitor Alert Ringing...");
      } 
      else if (type === 'approve') { // Happy ascending chime
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc1.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc1.frequency.setValueAtTime(1046.50, now + 0.24); // C6
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        
        osc1.start(now);
        osc1.stop(now + 0.8);
        this.showIndicator("✅ Access Approved Chime!");
      } 
      else if (type === 'decline') { // Two low warning tone
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(220.00, now); // A3
        osc1.frequency.setValueAtTime(196.00, now + 0.18); // G3
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.setValueAtTime(0.15, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc1.start(now);
        osc1.stop(now + 0.5);
        this.showIndicator("❌ Access Rejected Chime!");
      }
    } catch(e) {
      console.warn("AudioContext interaction required.", e);
    }
  },
  showIndicator(text) {
    const el = document.getElementById('sound-indicator');
    if (el) {
      el.querySelector('span').innerText = text;
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), 2500);
    }
  }
};

// --- INITIALIZE FIREBASE PRODUCTION ENGINE ---
function initFirebaseApp() {
  const config = getFirebaseConfig();
  if (config && config.apiKey && config.projectId) {
    try {
      if (firebase.apps.length === 0) {
        firebase.initializeApp(config);
      }
      db = firebase.firestore();
      storage = firebase.storage();
      auth = firebase.auth();
      
      try {
        fcm = firebase.messaging();
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('firebase-messaging-sw.js')
            .then((registration) => {
              fcm.useServiceWorker(registration);
              console.log("FCM Service Worker linked.");
              
              // Post the config settings to the service worker dynamically
              if (registration.active) {
                registration.active.postMessage({
                  type: 'SET_CONFIG',
                  config: config
                });
              }
              registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'activated') {
                    newWorker.postMessage({
                      type: 'SET_CONFIG',
                      config: config
                    });
                  }
                });
              });
            });
        }
      } catch (err) {
        console.warn("FCM messaging not supported or service worker blocked:", err);
      }
      
      state.firebaseEnabled = true;
      setupAuthListener();
      console.log("Production Firebase Suite fully initialized.");
    } catch (e) {
      console.error("Firebase App initialization crash:", e);
      state.firebaseEnabled = false;
      initSandboxMode();
    }
  } else {
    state.firebaseEnabled = false;
    initSandboxMode();
  }
}

// --- SECURE FIREBASE SECURITY AUTH & ROLE SYNCS ---
function setupAuthListener() {
  auth.onAuthStateChanged(async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          state.currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: userData.role || 'owner',
            wing: userData.wing || '',
            flat: userData.flat || 0,
            name: userData.name || 'Resident User'
          };
          
          // Save dynamic FCM registration token
          saveResidentFCMToken();
          
          // Load dashboard
          switchView(state.currentUser.role, state.currentUser.wing, state.currentUser.flat, state.currentUser.name);
          setupRealtimeListeners();
        } else {
          // Fallback if auth exists but firestore user document is missing
          console.warn("User auth entry exists but Firestore user document is missing. Autocreating...");
          logout();
        }
      } catch (err) {
        console.error("Auth profile fetch failure:", err);
        logout();
      }
    } else {
      state.currentUser = null;
      teardownListeners();
      switchView('logout');
    }
  });
}

function saveResidentFCMToken() {
  if (!fcm || !state.currentUser || state.currentUser.role !== 'owner') return;
  
  const config = getFirebaseConfig();
  fcm.getToken({ vapidKey: config.vapidKey })
    .then((currentToken) => {
      if (currentToken) {
        const flatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
        
        // Update user tokens in Firestore
        db.collection('users').doc(state.currentUser.uid).update({
          fcmToken: currentToken
        });
        
        // Update tokens in building directory document
        db.collection('buildingDirectory').doc(flatKey).update({
          fcmToken: currentToken
        });
        
        console.log("FCM registration token synced: ", currentToken);
      }
    }).catch((err) => {
      console.warn("FCM Token fetching failed. Ensure VAPID key is configured: ", err);
    });
}

// --- SYSTEM BROADCASTS & FCM REQUEST TRIGGERS (LEGACY ENDPOINT) ---
async function sendFCMPushNotification(targetFCMToken, title, body, dataPayload) {
  const config = getFirebaseConfig();
  if (!targetFCMToken || !config.fcmServerKey) {
    console.warn("FCM Server Key or target FCM registration token missing. Skipping background push.");
    return;
  }

  const payload = {
    to: targetFCMToken,
    notification: {
      title: title,
      body: body,
      icon: dataPayload.photo || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%231e3a8a"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="24">🏢</text></svg>',
      click_action: window.location.origin
    },
    data: dataPayload
  };

  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${config.fcmServerKey}`
      },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    console.log("FCM Background notification triggered:", result);
  } catch (err) {
    console.error("FCM trigger failure:", err);
  }
}

// --- REALTIME FIRESTORE LISTENERS ---
function setupRealtimeListeners() {
  teardownListeners();
  
  if (!db) return;

  // 1. Listen to building directory
  unsubscribeDirectory = db.collection('buildingDirectory').onSnapshot((snapshot) => {
    const list = [];
    snapshot.forEach(doc => {
      list.push(doc.data());
    });
    
    // Sort directories
    list.sort((a, b) => {
      if (a.wing !== b.wing) return a.wing.localeCompare(b.wing);
      return a.flat - b.flat;
    });
    
    state.flats = list;
    renderAllViews();
  }, (err) => {
    console.error("Directory listener failure:", err);
  });

  // 2. Listen to visitor requests
  let reqQuery = db.collection('visitorRequests');
  
  // If resident role, filter only requests targeting their flat to secure data privacy
  if (state.currentUser.role === 'owner') {
    reqQuery = reqQuery
      .where('wing', '==', state.currentUser.wing)
      .where('flat', '==', parseInt(state.currentUser.flat));
  }

  unsubscribeRequests = reqQuery.onSnapshot((snapshot) => {
    const prevCount = state.requests.length;
    const prevRequestsMap = {};
    state.requests.forEach(r => prevRequestsMap[r.id] = r.status);
    
    const list = [];
    snapshot.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort descending by timestamp
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    state.requests = list;
    
    // Check for trigger conditions
    if (state.currentUser) {
      const targetFlatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
      
      // Resident receives a new pending request
      if (state.currentUser.role === 'owner' && list.length > 0) {
        const latest = list[0];
        if (latest.status === 'pending' && prevRequestsMap[latest.id] === undefined) {
          soundSynth.play('new-request');
          showInAppNotificationBanner(latest);
        }
      }
      
      // Guard receives response updates
      if (state.currentUser.role === 'security' && prevCount > 0) {
        list.forEach(req => {
          const oldStatus = prevRequestsMap[req.id];
          if (oldStatus === 'pending' && req.status !== 'pending') {
            if (req.status === 'approved') soundSynth.play('approve');
            if (req.status === 'rejected') soundSynth.play('decline');
          }
        });
      }
    }
    
    renderAllViews();
  }, (err) => {
    console.error("Requests listener failure:", err);
  });
}

function teardownListeners() {
  if (unsubscribeRequests) {
    unsubscribeRequests();
    unsubscribeRequests = null;
  }
  if (unsubscribeDirectory) {
    unsubscribeDirectory();
    unsubscribeDirectory = null;
  }
}

// --- FIRESTORE DIRECTORY INITIAL SEED (batch writes) ---
async function checkAndSeedDirectory() {
  if (!db) return;
  
  try {
    const directoryRef = db.collection('buildingDirectory');
    const snap = await directoryRef.limit(1).get();
    
    if (snap.empty) {
      console.log("Firestore Building Directory is empty. Preloading Orchid Heights database...");
      
      // Create batch chunks (max 500 writes per batch in Firestore)
      let batch = db.batch();
      let count = 0;
      
      for (const flatData of PRESEEDED_DIRECTORY_DATA) {
        const docId = `${flatData.wing}-${flatData.flat}`;
        const docRef = directoryRef.doc(docId);
        
        batch.set(docRef, {
          wing: flatData.wing,
          flat: parseInt(flatData.flat),
          ownerNameEnglish: flatData.ownerNameEnglish || '',
          ownerNameGujarati: flatData.ownerNameGujarati || '',
          phone: flatData.phone || '',
          vehicles: [],
          members: []
        });
        
        count++;
        if (count >= 400) { // Commit batch and open a new one to prevent limits
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      
      if (count > 0) {
        await batch.commit();
      }
      console.log("Seeding complete. 96 official Orchid Heights flats stored.");
    }
  } catch (err) {
    console.error("Direct seeding failed:", err);
  }
}

// --- LOCAL STORAGE SANDBOX FALLBACK (NO DB AVAILABLE) ---
function initSandboxMode() {
  console.log("Entering sandbox storage mode...");
  const savedFlats = localStorage.getItem('orchid_flats');
  const savedReqs = localStorage.getItem('orchid_requests');
  
  if (savedFlats) {
    state.flats = JSON.parse(savedFlats);
  } else {
    // Generate preseeded registry array
    state.flats = PRESEEDED_DIRECTORY_DATA.map(f => ({
      wing: f.wing,
      flat: parseInt(f.flat),
      ownerNameEnglish: f.ownerNameEnglish || '',
      ownerNameGujarati: f.ownerNameGujarati || '',
      phone: f.phone || '',
      password: f.wing === 'B' && f.flat === 1104 ? '9898180810' : 'admin@123',
      vehicles: [],
      members: []
    }));
    localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
  }
  
  state.requests = savedReqs ? JSON.parse(savedReqs) : [];
  renderAllViews();
}

function saveSandboxBackup() {
  if (!state.firebaseEnabled) {
    localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
    localStorage.setItem('orchid_requests', JSON.stringify(state.requests));
  }
}

// Sandbox local storage synchronizer listener
window.addEventListener('storage', (e) => {
  if (state.firebaseEnabled) return;
  
  if (e.key === 'orchid_requests') {
    const list = JSON.parse(e.newValue || '[]');
    const prevCount = state.requests.length;
    
    // Scan triggers
    if (state.currentUser) {
      const targetFlatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
      
      if (state.currentUser.role === 'owner' && list.length > prevCount) {
        const latest = list.reduce((prev, curr) => (prev.timestamp > curr.timestamp) ? prev : curr, {});
        if (`${latest.wing}-${latest.flat}` === targetFlatKey && latest.status === 'pending') {
          soundSynth.play('new-request');
          showInAppNotificationBanner(latest);
        }
      }
      
      if (state.currentUser.role === 'security' && prevCount > 0) {
        list.forEach(req => {
          const old = state.requests.find(o => o.id === req.id);
          if (old && old.status === 'pending' && req.status !== 'pending') {
            if (req.status === 'approved') soundSynth.play('approve');
            if (req.status === 'rejected') soundSynth.play('decline');
          }
        });
      }
    }
    
    state.requests = list;
    renderAllViews();
  }
  
  if (e.key === 'orchid_flats') {
    state.flats = JSON.parse(e.newValue || '[]');
    renderAllViews();
  }
});


// --- SECURE VISITOR REQUEST REGISTER SYSTEM ---
async function createVisitorRequest(name, phone, email, wing, flat, reason, count, photoDataUrl) {
  const docId = 'req_' + Date.now();
  const targetFlat = state.flats.find(f => f.wing === wing && f.flat === parseInt(flat));
  const ownerName = targetFlat ? (targetFlat.ownerNameEnglish || 'Vacant Flat') : 'Unknown';
  
  let finalPhotoUrl = photoDataUrl || PRESET_AVATARS[state.selectedAvatar];
  
  // 1. Upload photo to Firebase Storage if connected
  if (state.firebaseEnabled && storage && photoDataUrl && photoDataUrl.startsWith('data:image')) {
    try {
      const photoRef = storage.ref().child(`visitor_photos/${docId}.jpg`);
      await photoRef.putString(photoDataUrl, 'data_url');
      finalPhotoUrl = await photoRef.getDownloadURL();
      console.log("Photo uploaded to cloud storage:", finalPhotoUrl);
    } catch(err) {
      console.warn("Storage upload failed, fallback to base64 encoding inline:", err);
    }
  }

  const payload = {
    visitorName: name,
    phone: phone,
    email: email || 'N/A',
    wing: wing,
    flat: parseInt(flat),
    ownerName: ownerName,
    reason: reason,
    visitorsCount: parseInt(count) || 1,
    photo: finalPhotoUrl,
    status: 'pending',
    createdAt: state.firebaseEnabled ? firebase.firestore.FieldValue.serverTimestamp() : new Date(),
    timestamp: Date.now()
  };

  if (state.firebaseEnabled && db) {
    try {
      // Save visitor request document
      await db.collection('visitorRequests').doc(docId).set(payload);
      
      // Save history log
      await db.collection('visitorHistory').add({
        requestId: docId,
        visitorName: name,
        wing: wing,
        flat: parseInt(flat),
        status: 'pending',
        action: 'Created Request Entry',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        performedBy: 'Security Guard'
      });
      
      // Fetch target flat details to pull their FCM device token
      if (targetFlat && targetFlat.fcmToken) {
        sendFCMPushNotification(
          targetFlat.fcmToken,
          "🚪 New Visitor Request",
          `A visitor is waiting for approval for Flat ${wing}-${flat}.`,
          {
            requestId: docId,
            visitorName: name,
            wing: wing,
            flat: flat,
            reason: reason,
            visitorsCount: String(count),
            photo: finalPhotoUrl
          }
        );
      }
      
      // If notification fallback is needed, write a notification log document
      await db.collection('notifications').add({
        targetType: 'flat',
        targetWing: wing,
        targetFlat: parseInt(flat),
        title: "🚪 New Visitor Request",
        body: `Visitor ${name} is waiting at the gate for approval.`,
        photo: finalPhotoUrl,
        requestId: docId,
        status: 'pending',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
    } catch (err) {
      console.error("Firestore request saving failure:", err);
      alert("Error saving request to database: " + err.message);
    }
  } else {
    // Sandbox write path
    const sandboxReq = { id: docId, ...payload };
    state.requests.unshift(sandboxReq);
    saveSandboxBackup();
    localStorage.setItem('orchid_requests', JSON.stringify(state.requests));
    renderAllViews();
  }
}

async function respondToRequest(requestId, status, reason = '') {
  const answeredBy = state.currentUser ? (state.currentUser.name + ` (${state.currentUser.wing}-${state.currentUser.flat})`) : 'Owner';
  
  if (state.firebaseEnabled && db) {
    try {
      const updateRef = db.collection('visitorRequests').doc(requestId);
      const updateData = {
        status: status,
        answeredAt: firebase.firestore.FieldValue.serverTimestamp(),
        answeredBy: answeredBy
      };
      
      if (status === 'rejected' && reason) {
        updateData.rejectionReason = reason;
      }
      
      await updateRef.update(updateData);
      
      // Log audit log
      await db.collection('visitorHistory').add({
        requestId: requestId,
        status: status,
        action: status === 'approved' ? 'Approved Entry' : 'Rejected Entry',
        rejectionReason: reason || 'N/A',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        performedBy: answeredBy
      });
      
      // Clear alert banners
      const banner = document.getElementById(`alert_${requestId}`);
      if (banner) banner.remove();
      
    } catch (err) {
      console.error("Response update failed:", err);
      alert("Failed to submit response: " + err.message);
    }
  } else {
    // Sandbox updates
    const req = state.requests.find(r => r.id === requestId);
    if (req) {
      req.status = status;
      req.answeredAt = new Date();
      req.answeredBy = answeredBy;
      if (status === 'rejected') {
        req.rejectionReason = reason || 'Declined';
      }
      
      saveSandboxBackup();
      localStorage.setItem('orchid_requests', JSON.stringify(state.requests));
      
      // Sound chime locally
      if (status === 'approved') soundSynth.play('approve');
      if (status === 'rejected') soundSynth.play('decline');
      
      const banner = document.getElementById(`alert_${requestId}`);
      if (banner) banner.remove();
      
      renderAllViews();
    }
  }
}

// --- VEHICLES & MEMBERS CRUD (OWNER PORTAL) ---
async function addVehicle(event) {
  event.preventDefault();
  const type = document.getElementById('vehicle-type').value;
  const plate = document.getElementById('vehicle-plate').value.trim().toUpperCase();
  
  if (!plate) return;

  const flatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
  const flatObj = state.flats.find(f => f.wing === state.currentUser.wing && f.flat === parseInt(state.currentUser.flat));
  
  if (flatObj) {
    const list = flatObj.vehicles ? [...flatObj.vehicles] : [];
    list.push({ type: type, plate: plate });
    flatObj.vehicles = list;
    
    if (state.firebaseEnabled && db) {
      await db.collection('buildingDirectory').doc(flatKey).update({ vehicles: list });
    } else {
      saveSandboxBackup();
      localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
      renderAllViews();
    }
    
    document.getElementById('vehicle-plate').value = '';
    alert("Vehicle registered!");
  }
}

async function removeVehicle(index) {
  const flatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
  const flatObj = state.flats.find(f => f.wing === state.currentUser.wing && f.flat === parseInt(state.currentUser.flat));
  
  if (flatObj && flatObj.vehicles) {
    const list = [...flatObj.vehicles];
    list.splice(index, 1);
    flatObj.vehicles = list;
    
    if (state.firebaseEnabled && db) {
      await db.collection('buildingDirectory').doc(flatKey).update({ vehicles: list });
    } else {
      saveSandboxBackup();
      localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
      renderAllViews();
    }
  }
}

async function addMember(event) {
  event.preventDefault();
  const name = document.getElementById('member-name').value.trim();
  const phone = document.getElementById('member-phone').value.trim();
  
  if (!name || !phone) return;

  const flatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
  const flatObj = state.flats.find(f => f.wing === state.currentUser.wing && f.flat === parseInt(state.currentUser.flat));
  
  if (flatObj) {
    const list = flatObj.members ? [...flatObj.members] : [];
    if (list.length >= 2) {
      alert("Maximum 2 members allowed per flat!");
      return;
    }
    list.push({ name: name, phone: phone });
    flatObj.members = list;
    
    if (state.firebaseEnabled && db) {
      await db.collection('buildingDirectory').doc(flatKey).update({ members: list });
    } else {
      saveSandboxBackup();
      localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
      renderAllViews();
    }
    
    document.getElementById('member-name').value = '';
    document.getElementById('member-phone').value = '';
    alert("Flat member added!");
  }
}

async function removeMember(index) {
  const flatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
  const flatObj = state.flats.find(f => f.wing === state.currentUser.wing && f.flat === parseInt(state.currentUser.flat));
  
  if (flatObj && flatObj.members) {
    const list = [...flatObj.members];
    list.splice(index, 1);
    flatObj.members = list;
    
    if (state.firebaseEnabled && db) {
      await db.collection('buildingDirectory').doc(flatKey).update({ members: list });
    } else {
      saveSandboxBackup();
      localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
      renderAllViews();
    }
  }
}


// --- ADMIN ACTIONS: CRUD & BULK EXCEL IMPORTS ---
window.openAdminEditFlat = function(wing, flatVal) {
  const flat = state.flats.find(f => f.wing === wing && f.flat === parseInt(flatVal));
  if (!flat) return;
  
  state.editingFlat = flat;
  document.getElementById('admin-edit-title').innerText = `Edit Flat ${wing}-${flatVal}`;
  document.getElementById('admin-owner-english').value = flat.ownerNameEnglish || '';
  document.getElementById('admin-owner-gujarati').value = flat.ownerNameGujarati || '';
  document.getElementById('admin-owner-phone').value = flat.phone || '';
  document.getElementById('admin-owner-password').value = flat.password || 'admin@123';
  
  document.getElementById('admin-edit-modal').style.display = 'flex';
};

window.closeAdminEditModal = function() {
  document.getElementById('admin-edit-modal').style.display = 'none';
  state.editingFlat = null;
};

window.saveAdminFlatDetails = async function(event) {
  event.preventDefault();
  if (!state.editingFlat) return;
  
  const eng = document.getElementById('admin-owner-english').value.trim();
  const guj = document.getElementById('admin-owner-gujarati').value.trim();
  const phone = document.getElementById('admin-owner-phone').value.trim();
  const pass = document.getElementById('admin-owner-password').value.trim();
  
  state.editingFlat.ownerNameEnglish = eng;
  state.editingFlat.ownerNameGujarati = guj;
  state.editingFlat.phone = phone;
  state.editingFlat.password = pass || 'admin@123';
  
  const flatKey = `${state.editingFlat.wing}-${state.editingFlat.flat}`;
  
  if (state.firebaseEnabled && db) {
    try {
      await db.collection('buildingDirectory').doc(flatKey).update({
        ownerNameEnglish: eng,
        ownerNameGujarati: guj,
        phone: phone,
        password: pass || 'admin@123'
      });
      
      // Update linked user password if they have registered an auth account
      // Note: Admins can't easily change auth passwords client-side without auth functions,
      // but we update the directory record so future sessions sync it.
      
      alert("Flat directory entry updated successfully!");
    } catch(err) {
      alert("Error updating Firestore document: " + err.message);
    }
  } else {
    saveSandboxBackup();
    localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
    renderAllViews();
    alert("Sandbox directory updated locally.");
  }
  closeAdminEditModal();
};

window.transferOwnership = async function() {
  if (!state.editingFlat) return;
  if (!confirm("Are you sure you want to clear this flat's current details and transfer ownership to a new resident?")) return;
  
  document.getElementById('admin-owner-english').value = '';
  document.getElementById('admin-owner-gujarati').value = '';
  document.getElementById('admin-owner-phone').value = '';
  document.getElementById('admin-owner-password').value = 'admin@123';
  
  alert("Ownership details cleared. Input new owner names and click Save Details to complete transfer.");
};

// Excel/CSV Importing via SheetJS library
window.importFromExcelFile = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);
      
      console.log("Importing rows: ", rows);
      let count = 0;
      
      if (state.firebaseEnabled && db) {
        let batch = db.batch();
        for (const row of rows) {
          const wing = String(row.WING || row.Wing || '').trim().toUpperCase();
          const flat = parseInt(row.FLATE_NO || row.Flat || row.FLAT || 0);
          
          if (!wing || !flat) continue;
          
          const flatKey = `${wing}-${flat}`;
          const ref = db.collection('buildingDirectory').doc(flatKey);
          
          batch.set(ref, {
            wing: wing,
            flat: flat,
            ownerNameEnglish: String(row.OWNER_NAME_ENGLISH || row.Name || '').trim(),
            ownerNameGujarati: String(row.OWNER_NAME_GUJARATI || row.Gujarati || '').trim(),
            phone: String(row.PHONE || row.Phone || row.Mobile || '').trim(),
            vehicles: [],
            members: []
          }, { merge: true });
          
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = db.batch();
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
        alert("Firestore batch seed upload successful!");
      } else {
        // Sandbox import
        rows.forEach(row => {
          const wing = String(row.WING || row.Wing || '').trim().toUpperCase();
          const flat = parseInt(row.FLATE_NO || row.Flat || row.FLAT || 0);
          
          if (wing && flat) {
            const match = state.flats.find(f => f.wing === wing && f.flat === flat);
            if (match) {
              match.ownerNameEnglish = String(row.OWNER_NAME_ENGLISH || row.Name || '').trim();
              match.ownerNameGujarati = String(row.OWNER_NAME_GUJARATI || row.Gujarati || '').trim();
              match.phone = String(row.PHONE || row.Phone || row.Mobile || '').trim();
            }
          }
        });
        saveSandboxBackup();
        localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
        renderAllViews();
        alert("Sandbox registry loaded locally from file.");
      }
    } catch(err) {
      alert("Error parsing file. Check file columns matches WING, FLATE_NO, OWNER_NAME_ENGLISH, OWNER_NAME_GUJARATI: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
};

window.exportRegistryToExcel = function() {
  try {
    const dataRows = state.flats.map(f => ({
      WING: f.wing,
      FLATE_NO: f.flat,
      OWNER_NAME_ENGLISH: f.ownerNameEnglish || '',
      OWNER_NAME_GUJARATI: f.ownerNameGujarati || '',
      PHONE_NUMBER: f.phone || '',
      VEHICLES: f.vehicles ? f.vehicles.map(v => v.plate).join(', ') : '',
      MEMBERS: f.members ? f.members.map(m => m.name).join(', ') : ''
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orchid Heights Registry");
    XLSX.writeFile(workbook, "Orchid_Heights_Owners_Registry.xlsx");
  } catch(err) {
    alert("Export failed: " + err.message);
  }
};

// Admin Broadcast Push sender
window.sendAdminBroadcastNotification = async function(event) {
  event.preventDefault();
  const scope = document.getElementById('broadcast-scope').value; // 'flat' | 'wing' | 'society'
  const targetWing = document.getElementById('broadcast-wing').value;
  const targetFlat = parseInt(document.getElementById('broadcast-flat').value);
  const title = document.getElementById('broadcast-title').value.trim();
  const body = document.getElementById('broadcast-body').value.trim();
  
  if (!title || !body) return;

  if (state.firebaseEnabled && db) {
    try {
      // 1. Add notification log to firestore
      await db.collection('notifications').add({
        targetType: scope,
        targetWing: targetWing,
        targetFlat: targetFlat || 0,
        title: title,
        body: body,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // 2. Loop and fire FCM push requests to devices
      let targets = [];
      if (scope === 'flat') {
        const flatObj = state.flats.find(f => f.wing === targetWing && f.flat === targetFlat);
        if (flatObj && flatObj.fcmToken) targets.push(flatObj.fcmToken);
      } else if (scope === 'wing') {
        state.flats.forEach(f => {
          if (f.wing === targetWing && f.fcmToken) targets.push(f.fcmToken);
        });
      } else {
        state.flats.forEach(f => {
          if (f.fcmToken) targets.push(f.fcmToken);
        });
      }
      
      targets.forEach(token => {
        sendFCMPushNotification(token, title, body, { type: 'broadcast' });
      });
      
      alert(`Broadcast notification dispatched to ${targets.length} registered devices.`);
      document.getElementById('broadcast-title').value = '';
      document.getElementById('broadcast-body').value = '';
    } catch(err) {
      alert("Dispatched fail: " + err.message);
    }
  } else {
    alert("Firebase disconnected! Broadcasts are unavailable in sandbox simulation mode.");
  }
};


// --- AUTHENTICATION & LOGIN PROCESSORS ---
window.handleSecurityLogin = async function(event) {
  event.preventDefault();
  const username = document.getElementById('sec-username').value.trim();
  const pass = document.getElementById('sec-password').value.trim();
  
  if (username === 'admin' && pass === 'admin@123') {
    if (state.firebaseEnabled && auth) {
      // Firebase email login mapper
      try {
        await auth.signInWithEmailAndPassword('security@orchidheights.com', 'admin@123');
      } catch(err) {
        if (err.code === 'auth/user-not-found') {
          // Auto bootstrap security user in auth
          try {
            const cred = await auth.createUserWithEmailAndPassword('security@orchidheights.com', 'admin@123');
            await db.collection('users').doc(cred.user.uid).set({
              email: 'security@orchidheights.com',
              role: 'security',
              name: 'Security Guard Gate 1'
            });
          } catch(signUpErr) {
            alert("Security Auth signup failed: " + signUpErr.message);
          }
        } else {
          alert("Firebase Auth error: " + err.message);
        }
      }
    } else {
      // Sandbox mode login path
      state.currentUser = { role: 'security', name: 'Security Gatekeeper' };
      switchView('security');
    }
    document.getElementById('sec-password').value = '';
  } else {
    alert("Invalid credentials. Try: admin / admin@123");
  }
};

window.handleResidentLogin = async function(event) {
  event.preventDefault();
  const wing = document.getElementById('res-wing').value;
  const flatNum = parseInt(document.getElementById('res-flat').value);
  const password = document.getElementById('res-password').value.trim();
  
  if (!wing || !flatNum || !password) return;

  const flatKey = `${wing}-${flatNum}`;
  const flatObj = state.flats.find(f => f.wing === wing && f.flat === flatNum);
  
  if (!flatObj) {
    alert("Flat registry records not found!");
    return;
  }

  // 1. Firebase Auth login flow
  if (state.firebaseEnabled && auth) {
    const email = `${wing.toLowerCase()}_${flatNum}@orchidheights.com`;
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch(err) {
      if (err.code === 'auth/user-not-found') {
        // If password matches database settings, auto-sign up user
        const correctPass = flatObj.password || (wing === 'B' && flatNum === 1104 ? '9898180810' : 'admin@123');
        if (password === correctPass) {
          try {
            // If flat is vacant, prompt for owner registration
            let ownerName = flatObj.ownerNameEnglish;
            if (!ownerName) {
              const claim = prompt("Flat setup pending. Enter Owner English Name to claim flat:");
              if (!claim) return;
              ownerName = claim.trim();
              await db.collection('buildingDirectory').doc(flatKey).update({ ownerNameEnglish: ownerName });
            }
            
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            const role = (wing === 'B' && flatNum === 1104) ? 'admin' : 'owner';
            
            await db.collection('users').doc(cred.user.uid).set({
              email: email,
              role: role,
              wing: wing,
              flat: flatNum,
              name: ownerName
            });
            
            // Password matches, signed up! Auth state listener will login user.
          } catch(signUpErr) {
            alert("Resident Auth account bootstrap failed: " + signUpErr.message);
          }
        } else {
          alert("Incorrect Password!");
        }
      } else {
        alert("Firebase Authentication Error: " + err.message);
      }
    }
  } else {
    // 2. Sandbox login path
    const correctPass = flatObj.password || (wing === 'B' && flatNum === 1104 ? '9898180810' : 'admin@123');
    if (password === correctPass) {
      if (!flatObj.ownerNameEnglish) {
        const claim = prompt("Flat setup pending. Enter Owner English Name to claim flat:");
        if (!claim) return;
        flatObj.ownerNameEnglish = claim.trim();
        saveSandboxBackup();
        localStorage.setItem('orchid_flats', JSON.stringify(state.flats));
      }
      
      const role = (wing === 'B' && flatNum === 1104) ? 'admin' : 'owner';
      state.currentUser = {
        role: role,
        wing: wing,
        flat: flatNum,
        name: flatObj.ownerNameEnglish || 'Resident'
      };
      
      switchView(role, wing, flatNum, state.currentUser.name);
    } else {
      alert("Invalid Portal Password!");
    }
  }
  document.getElementById('res-password').value = '';
};

window.logout = function() {
  if (state.firebaseEnabled && auth) {
    auth.signOut();
  } else {
    state.currentUser = null;
    switchView('logout');
  }
};


// --- WEBCAM Snapshots CONTROLLER ---
async function startWebcam() {
  const video = document.getElementById('camera-stream');
  const placeholder = document.getElementById('camera-placeholder');
  if (!video) return;
  
  try {
    if (state.stream) stopWebcam();
    
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: "environment" }
    });
    
    video.srcObject = state.stream;
    video.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } catch(err) {
    console.warn("Camera streaming failed:", err);
    if (placeholder) {
      placeholder.innerHTML = `<div style="padding:15px;"><span class="material-icons">videocam_off</span><p style="font-size:12px;margin-top:6px;">Webcam block / Not Found.</p></div>`;
    }
  }
}

function stopWebcam() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
}

function captureSnapshot() {
  const video = document.getElementById('camera-stream');
  const canvas = document.createElement('canvas');
  if (state.stream && video) {
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    state.capturedPhoto = canvas.toDataURL('image/jpeg');
    
    const box = document.getElementById('camera-box');
    if (box) {
      box.style.opacity = '0.4';
      setTimeout(() => box.style.opacity = '1', 120);
    }
    alert("Visitor Snapshot captured!");
  } else {
    alert("Webcam is not activated. Use presets below.");
  }
}


// --- DASHBOARD ROUTER AND VIEW CONTROL PANEL ---
function switchView(role, wing = '', flat = 0, name = '') {
  stopWebcam();
  
  const authContainer = document.getElementById('auth-view');
  const secContainer = document.getElementById('security-view');
  const resContainer = document.getElementById('resident-view');
  const adminContainer = document.getElementById('admin-view');
  const navBlock = document.getElementById('nav-info-block');
  const warnBlock = document.getElementById('firebase-warning-banner');
  
  if (role === 'security') {
    authContainer.style.display = 'none';
    secContainer.style.display = 'block';
    resContainer.style.display = 'none';
    adminContainer.style.display = 'none';
    navBlock.style.display = 'flex';
    if (warnBlock) warnBlock.style.display = state.firebaseEnabled ? 'none' : 'block';
    startWebcam();
  } 
  else if (role === 'owner') {
    authContainer.style.display = 'none';
    secContainer.style.display = 'none';
    resContainer.style.display = 'block';
    adminContainer.style.display = 'none';
    navBlock.style.display = 'flex';
    if (warnBlock) warnBlock.style.display = 'none'; // Hide config warning for basic residents
    
    // Seed resident header mockup profile details matching uploaded mockup
    document.getElementById('mock-resident-name').innerText = name || 'Resident';
    document.getElementById('mock-resident-flat').innerText = `${wing}-${flat} | Orchid Heights`;
    
    // Reset tabs
    switchCommunityTab('visitors');
  } 
  else if (role === 'admin') {
    authContainer.style.display = 'none';
    secContainer.style.display = 'none';
    resContainer.style.display = 'none';
    adminContainer.style.display = 'block';
    navBlock.style.display = 'flex';
    if (warnBlock) warnBlock.style.display = state.firebaseEnabled ? 'none' : 'block';
  } 
  else {
    // Logout / Login screen
    authContainer.style.display = 'block';
    secContainer.style.display = 'none';
    resContainer.style.display = 'none';
    adminContainer.style.display = 'none';
    navBlock.style.display = 'none';
    if (warnBlock) warnBlock.style.display = 'none';
  }
  
  // Sync simulation menu badges
  document.querySelectorAll('.btn-sim').forEach(b => b.classList.remove('active'));
  if (role === 'security') {
    document.getElementById('sim-btn-guard').classList.add('active');
  } else if (role === 'admin') {
    document.getElementById('sim-btn-admin').classList.add('active');
  } else if (role === 'owner') {
    const btn = document.getElementById('sim-btn-resident');
    btn.classList.add('active');
    btn.innerText = `Resident (${wing}-${flat})`;
  } else {
    document.getElementById('sim-btn-login').classList.add('active');
  }
  
  renderAllViews();
}

function renderAllViews() {
  // Sync header username badges
  document.querySelectorAll('.nav-user-label').forEach(el => {
    if (state.currentUser) {
      if (state.currentUser.role === 'security') el.innerText = 'Gate Security Guard';
      else if (state.currentUser.role === 'admin') el.innerText = 'Super Admin (B-1104)';
      else el.innerText = `Flat ${state.currentUser.wing}-${state.currentUser.flat} (${state.currentUser.name})`;
    }
  });

  if (!state.currentUser) return;

  if (state.currentUser.role === 'security') renderSecurityPortal();
  else if (state.currentUser.role === 'admin') renderAdminPortal();
  else renderResidentPortal();
}

// 1. RENDER SECURITY PORTAL
function renderSecurityPortal() {
  const wingSelect = document.getElementById('visitor-wing');
  const flatSelect = document.getElementById('visitor-flat');
  const ownerLabel = document.getElementById('visitor-owner-name');
  
  if (wingSelect && flatSelect && ownerLabel) {
    const wing = wingSelect.value;
    const flatVal = parseInt(flatSelect.value);
    const flat = state.flats.find(f => f.wing === wing && f.flat === flatVal);
    
    if (flat) {
      ownerLabel.innerHTML = flat.ownerNameEnglish 
        ? `Target Owner: <strong>${flat.ownerNameEnglish}</strong> <span class="gujarati-text">${flat.ownerNameGujarati}</span>`
        : `<strong style="color:var(--text-light)">Vacant Flat / Needs Registration</strong>`;
    } else {
      ownerLabel.innerText = "Select target flat to load owner...";
    }
  }

  // Draw Gate Log (Remove delete button for security guards!)
  const listContainer = document.getElementById('guard-requests-list');
  if (listContainer) {
    if (state.requests.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center; padding: 24px; color:var(--text-light); font-size:13px;">No entries logged today.</div>`;
    } else {
      listContainer.innerHTML = state.requests.map(req => {
        let statusBadge = '';
        if (req.status === 'pending') {
          statusBadge = `<span class="status-badge status-pending">⌛ Pending Approval</span>`;
        } else if (req.status === 'approved') {
          statusBadge = `<span class="status-badge status-approved">✅ Approved - Enter</span>`;
        } else {
          statusBadge = `<span class="status-badge status-declined" title="${req.rejectionReason || ''}">❌ Rejected</span>`;
        }
        
        // Hide delete option for guards completely!
        const deleteButton = (state.currentUser.role === 'admin') 
          ? `<button class="btn btn-danger" style="padding: 2px 6px; font-size:10px; margin-top:8px;" onclick="deleteRequestRecord('${req.id}')">Delete</button>` 
          : '';

        return `
          <div class="request-card" style="display:flex; gap:12px; background:#f8fafc; border:1px solid var(--border-color); padding:12px; border-radius: var(--radius-md); margin-bottom:10px;">
            <img src="${req.photo}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color);" alt="Visitor">
            <div style="flex:1; min-width:0; font-size:12.5px;">
              <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13px; color:var(--text-main);">
                <span>${req.visitorName} (${req.visitorsCount} visitors)</span>
                <span style="color:var(--primary-color)">${req.wing}-${req.flat}</span>
              </div>
              <div style="color:var(--text-muted); margin-top:2px;">Reason: ${req.reason} | Phone: ${req.phone}</div>
              <div style="color:var(--text-light); font-size:11px;">Owner: ${req.ownerName} | Time: ${new Date(req.timestamp).toLocaleTimeString()}</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                ${statusBadge}
                ${deleteButton}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Draw View-only directory table for guard
  renderBuildingDirectoryTable('guard-directory-table', 'guard-directory-search', false);
}

// 2. RENDER RESIDENT DASHBOARD PORTAL (MATCHING SCREENSHOT STYLINGS)
function renderResidentPortal() {
  const flatKey = `${state.currentUser.wing}-${state.currentUser.flat}`;
  const flatObj = state.flats.find(f => f.wing === state.currentUser.wing && f.flat === parseInt(state.currentUser.flat));
  
  // Show app notifications popup if pending requests exist
  const pendingRequests = state.requests.filter(r => `${r.wing}-${r.flat}` === flatKey && r.status === 'pending');
  pendingRequests.forEach(req => showInAppNotificationBanner(req));

  // Render tab active contents
  const wrapper = document.getElementById('community-tab-content');
  if (!wrapper) return;

  if (state.activeCommunityTab === 'visitors') {
    // Visitor logs sub panel
    const myVisits = state.requests.filter(r => `${r.wing}-${r.flat}` === flatKey);
    const logHTML = myVisits.length === 0 
      ? `<div style="text-align:center; padding:30px; color:var(--text-light); font-size:13px;">No visitor records found.</div>`
      : `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:16px;">` + myVisits.map(req => {
          let badge = '';
          if (req.status === 'pending') badge = `<span class="status-badge status-pending">Pending</span>`;
          else if (req.status === 'approved') badge = `<span class="status-badge status-approved">Approved</span>`;
          else badge = `<span class="status-badge status-declined" title="${req.rejectionReason || ''}">Declined</span>`;

          return `
            <div class="directory-card">
              <div class="directory-header">
                <span class="badge-tag">${req.guestType ? req.guestType.toUpperCase() : 'VISITOR'}</span>
                ${badge}
              </div>
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                <img src="${req.photo}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color);" alt="Visitor">
                <div>
                  <strong style="font-size:13.5px; color:var(--text-main); display:block;">${req.visitorName}</strong>
                  <span style="font-size:11px; color:var(--text-light);">${new Date(req.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <div style="font-size:12px; color:var(--text-muted); line-height:1.4;">
                <div>📞 Phone: ${req.phone}</div>
                <div>👤 Count: ${req.visitorsCount}</div>
                <div>📝 Reason: ${req.reason}</div>
                ${req.answeredBy ? `<div style="font-size:10.5px; color:var(--primary-color); margin-top:4px;">Action By: ${req.answeredBy}</div>` : ''}
              </div>
            </div>
          `;
        }).join('') + `</div>`;

    wrapper.innerHTML = `
      <div class="glass-card-title">🛎️ Visitors Log & History reports</div>
      ${logHTML}
    `;
  }
  else if (state.activeCommunityTab === 'directory') {
    // Directory card grid layout with Call buttons (tel:)
    const searchVal = document.getElementById('mock-directory-search') ? document.getElementById('mock-directory-search').value.toLowerCase().trim() : '';
    
    const list = state.flats.filter(f => {
      const nameEng = (f.ownerNameEnglish || '').toLowerCase();
      const nameGuj = (f.ownerNameGujarati || '').toLowerCase();
      const flatNum = String(f.flat);
      const wingVal = f.wing.toLowerCase();
      const searchStr = `${f.wing}-${f.flat}`.toLowerCase();
      
      return nameEng.includes(searchVal) || nameGuj.includes(searchVal) || flatNum.includes(searchVal) || wingVal.includes(searchVal) || searchStr.includes(searchVal);
    });

    const cardsHTML = list.length === 0
      ? `<div style="text-align:center; padding:30px; color:var(--text-light); font-size:13px;">No matching directory entries found.</div>`
      : `<div class="directory-grid">` + list.map(f => `
          <div class="directory-card">
            <div class="directory-header">
              <span class="directory-flat-badge">${f.wing}-${f.flat}</span>
              <span style="font-size:11px; color:var(--text-light);">${f.ownerNameEnglish ? 'Occupied' : 'Vacant'}</span>
            </div>
            <div style="margin-bottom:8px;">
              <strong style="font-size:14px; color:var(--text-main); display:block;">${f.ownerNameEnglish || 'Vacant Flat'}</strong>
              <span class="gujarati-text">${f.ownerNameGujarati || ''}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted);">
              ${f.phone ? `<div>📞 ${f.phone}</div>` : '<div>📞 No phone registered</div>'}
              ${f.vehicles && f.vehicles.length > 0 ? `<div style="margin-top:4px;">🚗 Vehicles: ${f.vehicles.map(v => v.plate).join(', ')}</div>` : ''}
            </div>
            ${f.phone ? `<a href="tel:${f.phone}" class="directory-contact-btn"><span class="material-icons" style="font-size:14px;">call</span> Click to Call</a>` : ''}
          </div>
        `).join('') + `</div>`;

    wrapper.innerHTML = `
      <div class="glass-card-title">📖 Building Resident Directory</div>
      <div class="search-box">
        <span class="material-icons search-icon">search</span>
        <input type="text" id="mock-directory-search" class="form-control" placeholder="Search residents by name, flat, wing or phone..." onkeyup="renderAllViews()">
      </div>
      ${cardsHTML}
    `;
    
    // Put cursor back to search box if they are typing
    const searchBox = document.getElementById('mock-directory-search');
    if (searchBox) {
      searchBox.value = searchVal;
      searchBox.focus();
    }
  }
  else if (state.activeCommunityTab === 'mom') {
    wrapper.innerHTML = `
      <div class="glass-card-title">📋 MOM (Minutes of Meeting)</div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="padding:14px; background:#f8fafc; border:1px solid var(--border-color); border-radius: var(--radius-md);">
          <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13.5px; margin-bottom:4px;">
            <span>Annual General Meeting - 2026</span>
            <span style="color:var(--text-light); font-size:11px;">May 15, 2026</span>
          </div>
          <p style="font-size:12px; color:var(--text-muted);">Discussion on building CCTV cameras installation at Wing A entrance lobby, main gate guard room repair approvals, and monthly maintenance collection audits.</p>
        </div>
        <div style="padding:14px; background:#f8fafc; border:1px solid var(--border-color); border-radius: var(--radius-md);">
          <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13.5px; margin-bottom:4px;">
            <span>Executive Committee Meeting</span>
            <span style="color:var(--text-light); font-size:11px;">March 08, 2026</span>
          </div>
          <p style="font-size:12px; color:var(--text-muted);">Reviewed gate guard shifts, resolved water tank filter replacement bids, and cleared parking slots reallocation parameters for Wings A & B residents.</p>
        </div>
      </div>
    `;
  }
  else if (state.activeCommunityTab === 'helpdesk') {
    wrapper.innerHTML = `
      <div class="glass-card-title">❓ Help Desk Ticket Portal</div>
      <form onsubmit="event.preventDefault(); alert('Ticket submitted to Society Office!'); this.reset();" style="max-width:500px;">
        <div class="form-group">
          <label>Issue Subject</label>
          <input type="text" class="form-control" placeholder="e.g. Lobby light fuse, water leakage" required>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea rows="3" class="form-control" placeholder="Explain your complaint details here..." required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Submit Complaint Ticket</button>
      </form>
    `;
  }
  else if (state.activeCommunityTab === 'staff') {
    wrapper.innerHTML = `
      <div class="glass-card-title">🧹 Society Maintenance Staff</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">
        <div style="padding:14px; border:1px solid var(--border-color); border-radius:var(--radius-md); text-align:center;">
          <div style="font-size:24px; margin-bottom:6px;">⚡</div>
          <strong>Jigneshbhai V.</strong>
          <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:8px;">Society Electrician</div>
          <a href="tel:9876543201" class="btn btn-secondary" style="padding:4px 8px; font-size:11px;">Call 98765 43201</a>
        </div>
        <div style="padding:14px; border:1px solid var(--border-color); border-radius:var(--radius-md); text-align:center;">
          <div style="font-size:24px; margin-bottom:6px;">🔧</div>
          <strong>Hareshbhai K.</strong>
          <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:8px;">Building Plumber</div>
          <a href="tel:9876543202" class="btn btn-secondary" style="padding:4px 8px; font-size:11px;">Call 98765 43202</a>
        </div>
        <div style="padding:14px; border:1px solid var(--border-color); border-radius:var(--radius-md); text-align:center;">
          <div style="font-size:24px; margin-bottom:6px;">👮</div>
          <strong>Ram Singh</strong>
          <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:8px;">Main Gate Guard</div>
          <a href="tel:9876543203" class="btn btn-secondary" style="padding:4px 8px; font-size:11px;">Call 98765 43203</a>
        </div>
      </div>
    `;
  }
  else if (state.activeCommunityTab === 'amenities') {
    wrapper.innerHTML = `
      <div class="glass-card-title">🏊 Society Amenities booking</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:16px;">
        <div style="border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
          <div style="height:100px; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:32px;">🏋️</div>
          <div style="padding:12px;">
            <strong>Residency Gym</strong>
            <div style="font-size:11.5px; color:var(--text-light); margin-bottom:8px;">Open 6:00 AM - 10:00 PM</div>
            <button class="btn btn-primary btn-block" style="font-size:11px; padding:4px;" onclick="alert('Gym slot booked successfully!')">Book Slot</button>
          </div>
        </div>
        <div style="border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
          <div style="height:100px; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:32px;">🏊</div>
          <div style="padding:12px;">
            <strong>Clubhouse Pool</strong>
            <div style="font-size:11.5px; color:var(--text-light); margin-bottom:8px;">Open 7:00 AM - 8:00 PM</div>
            <button class="btn btn-primary btn-block" style="font-size:11px; padding:4px;" onclick="alert('Pool slot booked successfully!')">Book Slot</button>
          </div>
        </div>
      </div>
    `;
  }
  
  // Render Personal tabs
  if (flatObj) {
    // Vehicles table
    const vTbody = document.getElementById('res-vehicles-tbody');
    if (vTbody) {
      if (!flatObj.vehicles || flatObj.vehicles.length === 0) {
        vTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-light);">No vehicles registered.</td></tr>`;
      } else {
        vTbody.innerHTML = flatObj.vehicles.map((v, i) => `
          <tr>
            <td><span class="vehicle-tag ${v.type === 'two' ? 'vehicle-2w' : 'vehicle-4w'}">${v.type === 'two' ? '🏍️ 2-Wheeler' : '🚗 4-Wheeler'}</span></td>
            <td><strong>${v.plate}</strong></td>
            <td><button class="btn btn-danger" style="padding:2px 8px; font-size:11px;" onclick="removeVehicle(${i})">Remove</button></td>
          </tr>
        `).join('');
      }
    }

    // Members table
    const mTbody = document.getElementById('res-members-tbody');
    if (mTbody) {
      if (!flatObj.members || flatObj.members.length === 0) {
        mTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-light);">No sub-members added (Max 2).</td></tr>`;
      } else {
        mTbody.innerHTML = flatObj.members.map((m, i) => `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>${m.phone}</td>
            <td><button class="btn btn-danger" style="padding:2px 8px; font-size:11px;" onclick="removeMember(${i})">Remove</button></td>
          </tr>
        `).join('');
      }
      
      const addMBtn = document.getElementById('btn-add-member');
      if (addMBtn) {
        addMBtn.disabled = (flatObj.members && flatObj.members.length >= 2);
      }
    }
  }
}

// 3. RENDER ADMIN PORTAL
function renderAdminPortal() {
  // Counters
  document.getElementById('stat-total-flats').innerText = state.flats.filter(f => f.ownerNameEnglish).length + ' / 96';
  document.getElementById('stat-total-visitors').innerText = state.requests.length;
  document.getElementById('stat-pending-approvals').innerText = state.requests.filter(r => r.status === 'pending').length;
  
  // Render Flats grids
  const gridA = document.getElementById('grid-wing-a');
  const gridB = document.getElementById('grid-wing-b');
  
  if (gridA && gridB) {
    const makeGridHTML = (wing) => {
      const list = state.flats.filter(f => f.wing === wing);
      list.sort((a,b) => a.flat - b.flat);
      
      return list.map(f => {
        let classes = 'flat-cell';
        if (f.ownerNameEnglish) classes += ' has-owner';
        if (f.wing === 'B' && f.flat === 1104) classes += ' is-admin';
        
        const initials = f.ownerNameEnglish ? f.ownerNameEnglish.split(' ').map(n=>n[0]).join('').slice(0,3) : 'Vacant';
        
        return `
          <div class="${classes}" onclick="openAdminEditFlat('${f.wing}', ${f.flat})">
            <span class="flat-num">${f.wing}-${f.flat}</span>
            <span class="flat-owner-initials">${initials}</span>
          </div>
        `;
      }).join('');
    };
    
    gridA.innerHTML = makeGridHTML('A');
    gridB.innerHTML = makeGridHTML('B');
  }

  // Draw admin search directory
  renderBuildingDirectoryTable('admin-directory-table', 'admin-directory-search', true);
}

// Global helper to render directory tables with Gujarati search support
function renderBuildingDirectoryTable(tableId, searchInputId, editableByAdmin = false) {
  const table = document.getElementById(tableId);
  const searchInput = document.getElementById(searchInputId);
  if (!table) return;
  
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const tbody = table.querySelector('tbody');
  
  const list = state.flats.filter(f => {
    const flatKey = `${f.wing}-${f.flat}`.toLowerCase();
    const nameEng = (f.ownerNameEnglish || '').toLowerCase();
    const nameGuj = (f.ownerNameGujarati || '').toLowerCase();
    const phoneNum = (f.phone || '').toLowerCase();
    
    const vehicleMatch = f.vehicles && f.vehicles.some(v => v.plate.toLowerCase().includes(query));
    
    return flatKey.includes(query) || nameEng.includes(query) || nameGuj.includes(query) || phoneNum.includes(query) || vehicleMatch;
  });

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-light);">No registry entries found.</td></tr>`;
  } else {
    tbody.innerHTML = list.map(f => {
      let vehicleHTML = '<span style="color:var(--text-light); font-size:11px;">None</span>';
      if (f.vehicles && f.vehicles.length > 0) {
        vehicleHTML = `<div class="vehicle-badge-list">` + f.vehicles.map(v => `
          <span class="vehicle-tag ${v.type === 'two' ? 'vehicle-2w' : 'vehicle-4w'}">${v.plate}</span>
        `).join('') + `</div>`;
      }
      
      const adminCol = editableByAdmin 
        ? `<td><button class="btn btn-secondary" style="padding:2px 8px; font-size:11.5px;" onclick="openAdminEditFlat('${f.wing}', ${f.flat})">Edit Flat</button></td>`
        : '';
        
      return `
        <tr>
          <td><strong style="color:var(--primary-color);">${f.wing}-${f.flat}</strong></td>
          <td>
            <strong>${f.ownerNameEnglish || 'Vacant Flat'}</strong>
            ${f.ownerNameGujarati ? `<span class="gujarati-text">${f.ownerNameGujarati}</span>` : ''}
          </td>
          <td>${f.phone ? `<a href="tel:${f.phone}" style="color:var(--primary-color); text-decoration:none; font-weight:500;">${f.phone}</a>` : '<span style="color:var(--text-light)">Unregistered</span>'}</td>
          <td>${vehicleHTML}</td>
          <td>
            <div style="font-size:11px; color:var(--text-muted);">
              ${f.members && f.members.length > 0 ? f.members.map(m=>m.name).join(', ') : 'None'}
            </div>
          </td>
          ${adminCol}
        </tr>
      `;
    }).join('');
  }
}

// In-app Alert overlay builder
function showInAppNotificationBanner(req) {
  const container = document.getElementById('notification-banner-container');
  if (!container) return;
  
  const alertId = `alert_${req.id}`;
  if (document.getElementById(alertId)) return; // Already rendered
  
  const banner = document.createElement('div');
  banner.id = alertId;
  banner.className = 'resident-alert';
  banner.innerHTML = `
    <div class="alert-header">
      <h3>🚪 New Visitor Request</h3>
      <span class="badge-tag" style="background:#eff6ff; color:#1e40af; font-size:10px;">PENDING ACCESS</span>
    </div>
    <div class="alert-body">
      <img src="${req.photo}" class="alert-visitor-img" alt="Visitor">
      <div class="alert-visitor-info">
        <div class="alert-visitor-name">${req.visitorName}</div>
        <div class="alert-visitor-meta">Phone: <span>${req.phone}</span></div>
        <div class="alert-visitor-meta">Count: <span>${req.visitorsCount} visitors</span></div>
        <div class="alert-visitor-meta">Reason: <span>${req.reason}</span></div>
        <div class="alert-visitor-meta">Time: <span>${new Date(req.timestamp).toLocaleTimeString()}</span></div>
      </div>
    </div>
    
    <div class="form-group" style="margin-bottom:10px;" id="rej-box-${req.id}">
      <input type="text" id="rej-reason-${req.id}" class="form-control" style="padding:6px; font-size:11.5px;" placeholder="Optional rejection reason...">
    </div>

    <div class="alert-actions">
      <button class="btn btn-danger" onclick="respondToRequest('${req.id}', 'rejected', document.getElementById('rej-reason-${req.id}').value)">❌ Reject</button>
      <button class="btn btn-success" onclick="respondToRequest('${req.id}', 'approved')">✅ Approve</button>
    </div>
  `;
  container.appendChild(banner);
}

// Delete log entry (Admins only!)
window.deleteRequestRecord = async function(requestId) {
  if (!confirm("Are you sure you want to permanently delete this visitor request record? This action is logged.")) return;
  
  if (state.firebaseEnabled && db) {
    try {
      await db.collection('visitorRequests').doc(requestId).delete();
      
      // Save delete audit trail
      await db.collection('visitorHistory').add({
        requestId: requestId,
        status: 'deleted',
        action: 'Permanently Deleted Record',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        performedBy: state.currentUser.name + ' (Admin)'
      });
      
      alert("Visitor log record deleted.");
    } catch(err) {
      alert("Delete failed: " + err.message);
    }
  } else {
    // Sandbox delete
    state.requests = state.requests.filter(r => r.id !== requestId);
    saveSandboxBackup();
    localStorage.setItem('orchid_requests', JSON.stringify(state.requests));
    renderAllViews();
    alert("Record removed from local sandbox.");
  }
};


// --- RESIDENT TAB NAVIGATOR SWITCHERS (Uploaded Mockup Style) ---
window.switchCommunityTab = function(tabName) {
  state.activeCommunityTab = tabName;
  
  // Update visual indicators on the grid cards
  document.querySelectorAll('.mock-community-card').forEach(card => {
    card.style.borderColor = 'var(--border-color)';
    card.style.boxShadow = 'var(--shadow-sm)';
  });
  
  const activeCard = document.getElementById(`mock-card-${tabName}`);
  if (activeCard) {
    activeCard.style.borderColor = 'var(--primary-color)';
    activeCard.style.boxShadow = '0 0 0 2px rgba(30,58,138,0.1)';
  }
  
  renderAllViews();
};

window.switchMockAppTab = function(type) {
  const commTab = document.getElementById('mock-tab-community');
  const persTab = document.getElementById('mock-tab-personal');
  const commSection = document.getElementById('mock-section-community');
  const persSection = document.getElementById('mock-section-personal');
  
  if (type === 'community') {
    commTab.classList.add('active');
    persTab.classList.remove('active');
    commSection.style.display = 'block';
    persSection.style.display = 'none';
    switchCommunityTab('visitors');
  } else {
    persTab.classList.add('active');
    commTab.classList.remove('active');
    commSection.style.display = 'none';
    persSection.style.display = 'block';
  }
};


// --- FIREBASE CONFIGURATION SETUP MANAGER ---
window.saveFirebaseConfig = function(event) {
  event.preventDefault();
  
  const apiKey = document.getElementById('cfg-api-key').value.trim();
  const databaseURL = document.getElementById('cfg-db-url').value.trim();
  const projectId = document.getElementById('cfg-project-id').value.trim();
  const messagingSenderId = document.getElementById('cfg-sender-id').value.trim();
  const appId = document.getElementById('cfg-app-id').value.trim();
  const vapidKey = document.getElementById('cfg-vapid-key').value.trim();
  const serverKey = document.getElementById('cfg-server-key').value.trim();
  
  if (!apiKey || !projectId) {
    alert("API Key and Project ID are required!");
    return;
  }
  
  const config = {
    apiKey: apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    databaseURL: databaseURL || `https://${projectId}-default-rtdb.firebaseio.com`,
    projectId: projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: messagingSenderId,
    appId: appId
  };
  
  localStorage.setItem('orchid_firebase_config', JSON.stringify(config));
  if (vapidKey) localStorage.setItem('orchid_fcm_vapid_key', vapidKey);
  if (serverKey) localStorage.setItem('orchid_fcm_server_key', serverKey);
  
  // Save credentials to firestore settings collection once database launches
  alert("Firebase configurations saved. Reloading application to launch services...");
  window.location.reload();
};

window.clearFirebaseConfig = function() {
  if (confirm("Are you sure you want to disconnect Firebase and revert to local storage sandbox?")) {
    localStorage.removeItem('orchid_firebase_config');
    localStorage.removeItem('orchid_fcm_vapid_key');
    localStorage.removeItem('orchid_fcm_server_key');
    window.location.reload();
  }
};


// --- SERVICE WORKER MESSAGING RECEIVER ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NOTIFICATION_ACTION') {
      const { action, requestId } = event.data;
      console.log(`[app.js] Intercepted Action ${action} for request ${requestId} from background worker.`);
      // Realtime listener triggers view updates, we just alert if needed
    }
  });
}


// --- INITIALIZATION ON DOCUMENT LOAD ---
document.addEventListener('DOMContentLoaded', () => {
  // Populate Wing Flat select elements
  const populateFlats = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    for (let fl = 1; fl <= 12; fl++) {
      for (let num = 1; num <= 4; num++) {
        const flatVal = fl * 100 + num;
        const opt = document.createElement('option');
        opt.value = flatVal;
        opt.innerText = flatVal;
        el.appendChild(opt);
      }
    }
  };
  
  populateFlats('res-flat');
  populateFlats('visitor-flat');
  populateFlats('broadcast-flat');
  
  // Setup dropdown event listeners
  const wSelect = document.getElementById('visitor-wing');
  const fSelect = document.getElementById('visitor-flat');
  if (wSelect && fSelect) {
    wSelect.addEventListener('change', renderAllViews);
    fSelect.addEventListener('change', renderAllViews);
  }

  // Preset Avatars click selectors
  document.querySelectorAll('.avatar-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      const active = e.currentTarget;
      active.classList.add('selected');
      state.selectedAvatar = active.dataset.avatar;
      state.capturedPhoto = '';
    });
  });

  // Custom File uploads
  const photoFile = document.getElementById('visitor-photo-file');
  if (photoFile) {
    photoFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          state.capturedPhoto = evt.target.result;
          alert("Visitor photo file uploaded!");
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Guard visitor form submissions
  const vForm = document.getElementById('visitor-entry-form');
  if (vForm) {
    vForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('visitor-name').value.trim();
      const phone = document.getElementById('visitor-phone').value.trim();
      const email = document.getElementById('visitor-email').value.trim();
      const wing = document.getElementById('visitor-wing').value;
      const flat = document.getElementById('visitor-flat').value;
      const count = document.getElementById('visitor-count').value;
      const reason = document.getElementById('visitor-reason').value.trim();
      
      if (!name || !phone || !wing || !flat || !reason) {
        alert("Please complete required visitor details!");
        return;
      }

      const photo = state.capturedPhoto || PRESET_AVATARS[state.selectedAvatar];
      
      await createVisitorRequest(name, phone, email, wing, flat, reason, count, photo);
      
      vForm.reset();
      state.capturedPhoto = '';
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      document.querySelector('[data-avatar="delivery"]').classList.add('selected');
      state.selectedAvatar = 'delivery';
      
      alert("Visitor request successfully broadcasted to resident!");
    });
  }

  // Prepopulate form configuration fields in Admin Panel
  const localConfig = localStorage.getItem('orchid_firebase_config');
  if (localConfig) {
    try {
      const parsed = JSON.parse(localConfig);
      document.getElementById('cfg-api-key').value = parsed.apiKey || '';
      document.getElementById('cfg-db-url').value = parsed.databaseURL || '';
      document.getElementById('cfg-project-id').value = parsed.projectId || '';
      document.getElementById('cfg-sender-id').value = parsed.messagingSenderId || '';
      document.getElementById('cfg-app-id').value = parsed.appId || '';
      document.getElementById('cfg-vapid-key').value = localStorage.getItem('orchid_fcm_vapid_key') || '';
      document.getElementById('cfg-server-key').value = localStorage.getItem('orchid_fcm_server_key') || '';
    } catch(err) {}
  }

  // Launch Systems
  initFirebaseApp();
  
  if (state.firebaseEnabled) {
    // If first-time firestore launch, preload the directory
    checkAndSeedDirectory();
  }
});

// --- OFFICIAL BUILDING DIRECTORY DATASET (96 flats) ---
const PRESEEDED_DIRECTORY_DATA = [
  // WING A
  { wing: 'A', flat: 101 },
  { wing: 'A', flat: 102 },
  { wing: 'A', flat: 103 },
  { wing: 'A', flat: 104 },
  { wing: 'A', flat: 201, ownerNameEnglish: 'MADHURI NANDHA SANGHAVI', ownerNameGujarati: 'માધુરી નાંઢા સંઘવી' },
  { wing: 'A', flat: 202, ownerNameEnglish: 'YATINBHAI MASHRU', ownerNameGujarati: 'યતિનભાઇ મશરૂ', phone: '9824329558' },
  { wing: 'A', flat: 203, ownerNameEnglish: 'VIJAY H. KARIA', ownerNameGujarati: 'વિજય એચ. કારીયા', phone: '9825781900' },
  { wing: 'A', flat: 204 },
  { wing: 'A', flat: 301, ownerNameEnglish: 'VISHAL BHAVINBHAI HINDOCHA', ownerNameGujarati: 'વિશાલ ભાવીનભાઇ હીંડોચા', phone: '9825220709' },
  { wing: 'A', flat: 302, ownerNameEnglish: 'NIRAV VRUJLAL KARIA', ownerNameGujarati: 'નિરવ વૃજલાલ કારીયા', phone: '9825225451' },
  { wing: 'A', flat: 303, ownerNameEnglish: 'VIVEK (RAJ) GANDUBHAI GADHIYA', ownerNameGujarati: 'વિવેક (રાજ) ગાંડુભાઇ ગઢીયા', phone: '9624576760' },
  { wing: 'A', flat: 304, ownerNameEnglish: 'JAGDISH C. SHINGALA', ownerNameGujarati: 'જગદિશ સી. શીંગાળા', phone: '9426135326' },
  { wing: 'A', flat: 401, ownerNameEnglish: 'KUSHAL VASANTRAY TIMBADIA', ownerNameGujarati: 'કુશલ વસંતરાય ટીંબડીયા', phone: '9428441600' },
  { wing: 'A', flat: 402, ownerNameEnglish: 'DR. ARVIND SISODIYA', ownerNameGujarati: 'ડૉ.ઓરવિંદ સીસોદીયા', phone: '9909187971' },
  { wing: 'A', flat: 403, ownerNameEnglish: 'VIMALBEN RASIKBHAI DAVDA', ownerNameGujarati: 'વિમલબેન રસીકભાઇ દાવડા', phone: '7874151955' },
  { wing: 'A', flat: 404 },
  { wing: 'A', flat: 501, ownerNameEnglish: 'SEEMA NIRAV PUROHIT', ownerNameGujarati: 'સીમા નિરવ પુરોહીત', phone: '9825220311' },
  { wing: 'A', flat: 502, ownerNameEnglish: 'VIJAY RATILAL DHANESHA', ownerNameGujarati: 'વિજય રતીલાલ ધનેશા', phone: '9428088707' },
  { wing: 'A', flat: 503, ownerNameEnglish: 'PRITESH JITENDRABHAI PAIDA', ownerNameGujarati: 'પ્રિતેશ જીતેન્દ્રભાઇ પૈડા', phone: '8128273022' },
  { wing: 'A', flat: 504, ownerNameEnglish: 'JADAVBHAI KANABHAI RAM', ownerNameGujarati: 'જાદવભાઇ કાનાભાઇ રામ', phone: '9428187694' },
  { wing: 'A', flat: 601, ownerNameEnglish: 'NITABEN MANISHBHAI YADAV', ownerNameGujarati: 'નિતાબેન મનિષભાઇ યાદવ', phone: '9727715652' },
  { wing: 'A', flat: 602, ownerNameEnglish: 'GOVIND CHAVDA', ownerNameGujarati: 'ગોવિંદ ચાવડા', phone: '9368411111' },
  { wing: 'A', flat: 603, ownerNameEnglish: 'RAMESHBHAI MULJIBHAI SODHA', ownerNameGujarati: 'รમેશભાઇ મુળજીભાઇ સોઢા', phone: '9428249383' },
  { wing: 'A', flat: 604, ownerNameEnglish: 'BHARATBHAI PITHIYA', ownerNameGujarati: 'ભરતભાઇ પીઠીયા', phone: '9904004522' },
  { wing: 'A', flat: 701, ownerNameEnglish: 'MITUL KIRITBHAI MAHETA', ownerNameGujarati: 'મિતુલ કીરીટભાઇ મહેતા', phone: '9825858583' },
  { wing: 'A', flat: 702, ownerNameEnglish: 'DHRUVILBHAI MANIYAR', ownerNameGujarati: 'ધ્રુવિલભાઇ મણીયાર', phone: '9979047471' },
  { wing: 'A', flat: 703, ownerNameEnglish: 'JITENDRA C. NATHWANI', ownerNameGujarati: 'જીતેન્દ્ર સી. નથવાણી', phone: '9824187900' },
  { wing: 'A', flat: 704, ownerNameEnglish: 'PARESHBHAI DESAI', ownerNameGujarati: 'પરેશભાઇ દેસાઇ', phone: '9825728082' },
  { wing: 'A', flat: 801, ownerNameEnglish: 'HASMUKHBHAI J. RATANPARA', ownerNameGujarati: 'હસમુખભાઇ જે. રતનપરા', phone: '9824218600' },
  { wing: 'A', flat: 802, ownerNameEnglish: 'KETANKUMAR JAYANTILAL KACHHADIYA', ownerNameGujarati: 'કેતનકુમાર જયંતિલાલ કાછડીયા', phone: '9727780905' },
  { wing: 'A', flat: 803, ownerNameEnglish: 'CHINTAN VRUJLAL KARIA', ownerNameGujarati: 'ચિંતન વૃજલાલ કારીયા', phone: '9428262580' },
  { wing: 'A', flat: 804, ownerNameEnglish: 'PARESHBHAI KARIA', ownerNameGujarati: 'પરેશભાઇ કારીયા' },
  { wing: 'A', flat: 901, ownerNameEnglish: 'NALIN ALABHAI ODEDARA', ownerNameGujarati: 'નલીન આલાભાઇ ઓડેદરા', phone: '9824295982' },
  { wing: 'A', flat: 902, ownerNameEnglish: 'SUNIL NARANDAS CHANIYARA', ownerNameGujarati: 'સુનિલ નારણદાસ ચનીયારા', phone: '9426982191' },
  { wing: 'A', flat: 903, ownerNameEnglish: 'MOHIT PRAVINBHAI TANK', ownerNameGujarati: 'મોહિત પ્રવિણભાઇ ટાંક', phone: '9537820006' },
  { wing: 'A', flat: 904 },
  { wing: 'A', flat: 1001, ownerNameEnglish: 'BHAVIK MAHENDRABHAI JADAV', ownerNameGujarati: 'ભાવિક મેહેન્દ્રભાઇ જાદવ', phone: '9824233655' },
  { wing: 'A', flat: 1002, ownerNameEnglish: 'DEVYANI B. KAMBALIYA', ownerNameGujarati: 'નિરૂબેન કાંબલીયા', phone: '9998023380' },
  { wing: 'A', flat: 1003, ownerNameEnglish: 'PRAKASH MODHWADIA', ownerNameGujarati: 'પ્રકાશ મોઢવાડીયા', phone: '9316662724' },
  { wing: 'A', flat: 1004 },
  { wing: 'A', flat: 1101, ownerNameEnglish: 'DR. JAYESH ALABHAI ODEDARA', ownerNameGujarati: 'ડૉ.જયેશ આલાભાઇ ઓડેદરા', phone: '9824295982' },
  { wing: 'A', flat: 1102, ownerNameEnglish: 'DALSANIA NANDLALBHAI ANANDBHAI', ownerNameGujarati: 'દલસાણીયા નંદલાલભાઇ આણંદભાઇ', phone: '9428378934' },
  { wing: 'A', flat: 1103, ownerNameEnglish: 'VINUBHAI CHANIYARA', ownerNameGujarati: 'વિનુભાઇ ચનીયારા', phone: '9825142708' },
  { wing: 'A', flat: 1104 },
  { wing: 'A', flat: 1201, ownerNameEnglish: 'CHETNABEN SATISHBHAI DAVE', ownerNameGujarati: 'ચેતનાબેન સતિષભાઇ દવે', phone: '9662513213' },
  { wing: 'A', flat: 1202 },
  { wing: 'A', flat: 1203 },
  { wing: 'A', flat: 1204 },

  // WING B
  { wing: 'B', flat: 101, ownerNameEnglish: 'SHASIKANT JOSHI (RENTER)', ownerNameGujarati: 'શશીકાત જોષી (ભાડુઆત)', phone: '9978441034' },
  { wing: 'B', flat: 102, ownerNameEnglish: 'MITESH V. HIRPARA', ownerNameGujarati: 'મિતેષ વી. હિરપરા', phone: '8160698908' },
  { wing: 'B', flat: 103, ownerNameEnglish: 'DR. RAMYATA DAYATAR', ownerNameGujarati: 'ડૉ.રમ્યતા દયાતર', phone: '9429047979' },
  { wing: 'B', flat: 104, ownerNameEnglish: 'RAVIBHAI PRAKASHCHANDRA KARIA', ownerNameGujarati: 'રવિભાઇ પ્રકાશચંદ્ર કારીયા', phone: '8780163117' },
  { wing: 'B', flat: 201, ownerNameEnglish: 'CHETAN CHHAGANBHAI MARU', ownerNameGujarati: 'ચેતન છગનભાઇ મારૂ', phone: '9427739252' },
  { wing: 'B', flat: 202, ownerNameEnglish: 'TEJASBHAI B. UNADKAT', ownerNameGujarati: 'તેજસભાઇ બી. ઉનડકટ', phone: '9824510500' },
  { wing: 'B', flat: 203, ownerNameEnglish: 'YASH HITESHBHAI BHUPTANI', ownerNameGujarati: 'યશ હિતેશભાઇ ભુપતાણી', phone: '9409123459' },
  { wing: 'B', flat: 204, ownerNameEnglish: 'DHARMENDRA BABULAL OZA', ownerNameGujarati: 'ધર્મેન્દ્ર બાબુલાલ ઓઝા', phone: '9427446795' },
  { wing: 'B', flat: 301, ownerNameEnglish: 'DR.JIGNESH PRAVINBHAI SAMTA', ownerNameGujarati: 'ડૉ.જીગ્નેશ પ્રવિણભાઇ સામતા', phone: '9426444290' },
  { wing: 'B', flat: 302, ownerNameEnglish: 'KETAN SURYAKANT KARIA', ownerNameGujarati: 'કેતન સુર્યકાન્ત કારીયા', phone: '9227810111' },
  { wing: 'B', flat: 303, ownerNameEnglish: 'ATUL CHHAGANBHAI MARU', ownerNameGujarati: 'અતુલ છગનભાઇ મારૂ', phone: '9924325716' },
  { wing: 'B', flat: 304, ownerNameEnglish: 'GIRISHBHAI S. ANADA', ownerNameGujarati: 'ગીરીશભાઇ એસ. અનડા', phone: '9265377120' },
  { wing: 'B', flat: 401, ownerNameEnglish: 'SHANTILAL DRARKADAS UNADKAT', ownerNameGujarati: 'શાંતિલાલ દ્વારકાદાસ ઉનડકટ', phone: '9824277076' },
  { wing: 'B', flat: 402, ownerNameEnglish: 'DINESHBHAI ZALA', ownerNameGujarati: 'દિનેશભાઇ ઝાલા', phone: '9879477727' },
  { wing: 'B', flat: 403, ownerNameEnglish: 'VIJAYBHAI KAKUBHAI VYAS', ownerNameGujarati: 'વિજયભાઇ કાકુભાઇ વ્યાસ', phone: '9427496836' },
  { wing: 'B', flat: 404, ownerNameEnglish: 'SANDIP JITEDNRABHAI SANGANI', ownerNameGujarati: 'સંદિપ જીતેન્દ્રભાઇ સાંગાણી', phone: '9426732248' },
  { wing: 'B', flat: 501, ownerNameEnglish: 'CA PRATIK SURESHBHAI UNADKAT', ownerNameGujarati: 'CA. પ્રતિક સુરેશભાઇ ઉનડકટ', phone: '9722802950' },
  { wing: 'B', flat: 502, ownerNameEnglish: 'DR.DHARMESH N. CHETARIYA', ownerNameGujarati: 'ડૉ. ધર્મેશ એન. ચેતરીયા', phone: '9427268488' },
  { wing: 'B', flat: 503, ownerNameEnglish: 'PRAKASHBHAI HIRANI', ownerNameGujarati: 'પ્રકાશભાઇ હિરાણી', phone: '9913236902' },
  { wing: 'B', flat: 504, ownerNameEnglish: 'KAUSHIKBHAI PUROHIT', ownerNameGujarati: 'કૌશીકભાઇ પુરોહીતા', phone: '9909026986' },
  { wing: 'B', flat: 601, ownerNameEnglish: 'DIPTIBEN JITENDRA JHALA', ownerNameGujarati: 'દિપ્તીબેન જીતેન્દ્ર ઝાલા', phone: '9428242708' },
  { wing: 'B', flat: 602, ownerNameEnglish: 'HIREN RAMESHBHAI POPAT', ownerNameGujarati: 'હિરેન રમેશભાઇ પોપટ', phone: '9909231429' },
  { wing: 'B', flat: 603, ownerNameEnglish: 'JIGNESH CHIMANLAL KARIA', ownerNameGujarati: 'જીગ્નેશ ચીમનલાલ કારીયા', phone: '9879129901' },
  { wing: 'B', flat: 604, ownerNameEnglish: 'KAMLESH M. RATHOD', ownerNameGujarati: 'કમલેશ એમ. રાઠોડ', phone: '7874151955' },
  { wing: 'B', flat: 701, ownerNameEnglish: 'SURESHBHAI JAGDISHCHANDRA POPAT', ownerNameGujarati: 'સુરેશભાઇ જગદીશચંદ્ર પોપટ', phone: '9408894883' },
  { wing: 'B', flat: 702, ownerNameEnglish: 'BHAVINBHAI MANEK', ownerNameGujarati: 'ભાવીનભાઇ માણેક', phone: '9054625184' },
  { wing: 'B', flat: 703, ownerNameEnglish: 'MANOJ NANDLAL BHUPTANI', ownerNameGujarati: 'મનોજ નંદલાલ ભુતપાની', phone: '9726066967' },
  { wing: 'B', flat: 704, ownerNameEnglish: 'CHETAN VINODRAI BHATT', ownerNameGujarati: 'ચેતન વિનોદરાય ભટ્ટ', phone: '7801874000' },
  { wing: 'B', flat: 801, ownerNameEnglish: 'MANISHBHAI BUDHHBHATTI', ownerNameGujarati: 'મનિષભાઇ બુધ્ધભટ્ટી', phone: '8160429850' },
  { wing: 'B', flat: 802, ownerNameEnglish: 'TANK NANJIBHAI KHIMJIBHAI', ownerNameGujarati: 'ટાંક નાનજીભાઇ ખીમજીભાઇ', phone: '9327726259' },
  { wing: 'B', flat: 803, ownerNameEnglish: 'VIMAL ANILKUMAR LAKHANI', ownerNameGujarati: 'વિમલ અનિલકુમાર લાખાણી', phone: '9879455150' },
  { wing: 'B', flat: 804, ownerNameEnglish: 'SURESH M. BHATT', ownerNameGujarati: 'સુરેશ એમ. ભટ્ટ', phone: '9601032732' },
  { wing: 'B', flat: 901, ownerNameEnglish: 'BHIKHABHAI NARANBHAI MAKWANA', ownerNameGujarati: 'ભીખાભાઇ નારણભાઇ મકવાણા', phone: '8849240127' },
  { wing: 'B', flat: 902, ownerNameEnglish: 'RAMBHAI BHIKHABHAI MAKWANA', ownerNameGujarati: 'રામભાઇ ભીખાભાઇ મકવાણા', phone: '8849240127' },
  { wing: 'B', flat: 903, ownerNameEnglish: 'HITESHKUMAR C. KANTARIYA', ownerNameGujarati: 'હિતેશકુમાર સી. કંટારીયા', phone: '9925393711' },
  { wing: 'B', flat: 904, ownerNameEnglish: 'ARUN BHUTAIYA', ownerNameGujarati: 'અરૂણ ભુતૈયા', phone: '9825648395' },
  { wing: 'B', flat: 1001, ownerNameEnglish: 'KESHUBHAI D. PATEL', ownerNameGujarati: 'કેશુભાઇ ડી. પટેલ', phone: '9426220937' },
  { wing: 'B', flat: 1002, ownerNameEnglish: 'DHARMESHBHAI KARSANBHAI DAVARA', ownerNameGujarati: 'ધર્મેશભાઇ કરશનભાઇ ડાવરા', phone: '9427702124' },
  { wing: 'B', flat: 1003, ownerNameEnglish: 'PARESH RAVINDRABHAI DAVARA', ownerNameGujarati: 'પરેશ રવિન્દ્રભાઇ ડાવરા', phone: '9879758627' },
  { wing: 'B', flat: 1004, ownerNameEnglish: 'DR. TRUPTIBEN K. VYAS', ownerNameGujarati: 'ડૉ.તૃપ્તિબેન કે. વ્યાસ', phone: '9662030836' },
  { wing: 'B', flat: 1101, ownerNameEnglish: 'BAKULBHAI D. TAILI', ownerNameGujarati: 'બકુલભાઇ ડી. તૈલી', phone: '7778959477' },
  { wing: 'B', flat: 1102, ownerNameEnglish: 'ASHVIN VITHALBHAI BHESANIYA', ownerNameGujarati: 'અશ્વિન વિઠ્ઠલભાઇ ભેંસાણીયા', phone: '9974817482' },
  { wing: 'B', flat: 1103, ownerNameEnglish: 'SIHAL KESHUBHAI ODEDARA', ownerNameGujarati: 'સિંહલ કેશુભાઇ ઓડેદરા', phone: '9825138905' },
  { wing: 'B', flat: 1104, ownerNameEnglish: 'RAHUL JASHVANTRAI POPAT', ownerNameGujarati: 'રાહુલ જશવંતરાય પોપટ', phone: '9898180810' },
  { wing: 'B', flat: 1201, ownerNameEnglish: 'ATUL JERAMBHAI BUTANI', ownerNameGujarati: 'અતુલ જેરામભાઇ બુટાણી', phone: '9979876303' },
  { wing: 'B', flat: 1202, ownerNameEnglish: 'CHANDRAKANT N. JADAV', ownerNameGujarati: 'ચંદ્રકાન્ત એન. જાદવ', phone: '9909230477' },
  { wing: 'B', flat: 1203, ownerNameEnglish: 'MUKESH N. CHUDASAMA', ownerNameGujarati: 'મુકેશ એન. ચુડાસમા', phone: '9892063606' },
  { wing: 'B', flat: 1204, ownerNameEnglish: 'BHARATBHAI MANDAVIYA', ownerNameGujarati: 'ભરતભાઇ માંડવીયા', phone: '8347026516' }
];
