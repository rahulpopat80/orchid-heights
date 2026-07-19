/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { FlatOwner, UserSession } from './types';
import Login from './components/Login';
import Navbar from './components/Navbar';
import SecurityDashboard from './components/SecurityDashboard';
import ResidentDashboard from './components/ResidentDashboard';
import Directory from './components/Directory';
import AdminPage from './components/AdminPage';
import { api, detectServerEnvironment } from './lib/api';
import { registerFCMToken, subscribeToForegroundMessages } from './lib/firebase';
import firebaseConfig from '../firebase-applet-config.json';

export default function App() {
  const navigate = useNavigate();

  // Session details stored in localStorage for persistent logins
  const [session, setSession] = useState<UserSession | null>(() => {
    try {
      const saved = localStorage.getItem('orchid_gate_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [adminSession, setAdminSession] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('orchid_admin_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Master owners list
  const [owners, setOwners] = useState<FlatOwner[]>([]);
  const [loadingOwners, setLoadingOwners] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('directory');

  // Load the full list of flat owners
  const loadOwners = async () => {
    setLoadingOwners(true);
    try {
      await detectServerEnvironment();
      const data = await api.getOwners();
      if (Array.isArray(data)) {
        setOwners(data);
      }
    } catch (error) {
      console.error('Failed to load owners directory:', error);
    } finally {
      setLoadingOwners(false);
    }
  };

  // Fetch owners directory when app boots or session loads, and subscribe in real-time
  useEffect(() => {
    loadOwners();
    
    const unsubscribe = api.subscribeOwners((data) => {
      if (Array.isArray(data)) {
        setOwners(data);
      }
    }, (err) => {
      console.warn('Real-time owners subscription failed, using manual reload fallback:', err);
    });

    return () => unsubscribe();
  }, []);

  // Register service worker and aggressively request Notification permission on startup
  useEffect(() => {
    const setupSW = async () => {
      if (!('serviceWorker' in navigator)) return;

      try {
        // Force-unregister old SW if project changed
        const currentProjectId = firebaseConfig.projectId;
        const cachedProject = localStorage.getItem('orchid_sw_project_id');

        if (cachedProject && cachedProject !== currentProjectId) {
          console.log('[SW] Project changed. Unregistering old service workers...');
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.unregister();
          }
          localStorage.setItem('orchid_sw_project_id', currentProjectId);
        }

        // Always register/update service worker on every page load
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          updateViaCache: 'none' // Always fetch fresh SW file, never use cache
        });

        // Force immediate update to pick up latest SW code
        await reg.update();
        console.log('[SW] Service worker registered and updated:', reg.scope);
        localStorage.setItem('orchid_sw_project_id', currentProjectId);

      } catch (err) {
        console.error('[SW] Service worker setup failed:', err);
      }

      // Aggressively request notification permission
      if ('Notification' in window) {
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          console.log('[Notifications] Permission result:', perm);
        } else {
          console.log('[Notifications] Permission already:', Notification.permission);
        }
      }
    };

    setupSW();
  }, []);

  // Register FCM token on every app boot when owner is logged in
  // This ensures the device token is always fresh and registered
  useEffect(() => {
    if (session && (session.role === 'owner' || session.role === 'admin') && session.wing && session.flatNo) {
      const setupFCM = async () => {
        // Wait for SW to be ready
        await navigator.serviceWorker.ready;
        
        // Small delay to ensure SW is fully activated
        await new Promise(resolve => setTimeout(resolve, 1500));

        const token = await registerFCMToken(session.wing!, session.flatNo!);
        if (token) {
          console.log('[FCM] Token registered/refreshed for flat', session.wing, session.flatNo, '→', token.substring(0, 20) + '...');
        } else {
          console.warn('[FCM] Failed to get token - notifications may not work. Check browser permissions.');
        }
      };

      setupFCM().catch(err => console.warn('[FCM] Setup error:', err));

      // Subscribe to foreground FCM messages (when app is OPEN)
      const unsubFCM = subscribeToForegroundMessages((payload) => {
        console.log('[FCM Foreground] Message received:', payload);
        // Show OS notification for foreground messages too (otherwise they only show in-app)
        if ('Notification' in window && Notification.permission === 'granted') {
          const data = payload.data || {};
          const notif = payload.notification || {};
          const type = data.type || '';
          const visitorId = data.visitorId;
          
          if (navigator.serviceWorker.controller) {
            // Use service worker to show notification (supports actions like approve/reject)
            navigator.serviceWorker.ready.then(reg => {
              const opts: any = {
                body: notif.body || data.body || '',
                icon: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
                badge: 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
                tag: visitorId || type || 'foreground_notif',
                data: data,
                requireInteraction: type === 'visitor' || type === 'visitor_request',
                vibrate: [200, 100, 200]
              };
              if (type === 'visitor' || type === 'visitor_request') {
                opts.actions = [
                  { action: 'approve', title: '✅ Approve Entry' },
                  { action: 'reject', title: '❌ Reject' }
                ];
              }
              reg.showNotification(notif.title || 'Orchid Heights', opts);
            });
          }
        }
      });
      return () => unsubFCM();
    }
  }, [session]);

  // Set default tabs based on authenticated roles
  useEffect(() => {
    if (session) {
      if (session.role === 'security') {
        setActiveTab('security');
      } else if (session.role === 'owner' || session.role === 'admin') {
        setActiveTab('resident');
      }
    } else {
      setActiveTab('directory');
    }
  }, [session]);

  // Capture device details for security logs when residents log in
  useEffect(() => {
    if (session && (session.role === 'owner' || session.role === 'admin') && session.wing && session.flatNo) {
      const captureDevice = async () => {
        try {
          const flatKey = `${session.wing}_${session.flatNo}`;
          
          // 1. Fetch public IP address using an online API, fallback if offline or failed
          let ipAddress = '127.0.0.1';
          try {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            if (data.ip) ipAddress = data.ip;
          } catch {
            try {
              const res = await fetch('https://api64.ipify.org?format=json');
              const data = await res.json();
              if (data.ip) ipAddress = data.ip;
            } catch (e) {
              console.warn('IP lookup failed, using local network IP:', e);
            }
          }

          // 2. Base deviceId firmly on IP address to prevent duplicating on storage clears
          // We attach a hash of the flatKey so the same IP can log into multiple flats independently if needed,
          // but for the same flat on the same IP, it's always strictly 1 device.
          const deviceId = `dev_ip_${ipAddress.replace(/\./g, '_')}_${flatKey}`;
          
          // 3. Get or create a virtual persistent IMEI number mapped to this IP ID
          let imei = localStorage.getItem(`orchid_imei_${deviceId}`);
          if (!imei) {
            imei = '358401' + Math.floor(100000 + Math.random() * 900000) + Math.floor(10 + Math.random() * 90);
            localStorage.setItem(`orchid_imei_${deviceId}`, imei);
          }

          // 4. Parse OS and Browser details elegantly
          const ua = navigator.userAgent;
          let os = 'Other Device';
          if (/android/i.test(ua)) os = 'Android';
          else if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS';
          else if (/win/i.test(ua)) os = 'Windows';
          else if (/mac/i.test(ua)) os = 'MacOS';
          else if (/linux/i.test(ua)) os = 'Linux';

          let browser = 'Browser';
          if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) browser = 'Chrome';
          else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
          else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
          else if (/edge|edg/i.test(ua)) browser = 'Edge';
          else if (/opr/i.test(ua)) browser = 'Opera';

          const devInfo = {
            deviceId,
            ipAddress,
            userAgent: ua,
            imei,
            os,
            browser,
            lastLogin: new Date().toISOString(),
            phoneNumber: session.phone
          };

          await api.registerDevice(session.wing, session.flatNo, devInfo);
          
          // Refresh local directory data after logging device
          const updatedOwners = await api.getOwners();
          if (Array.isArray(updatedOwners)) {
            setOwners(updatedOwners);
          }
        } catch (err) {
          console.error('Device registration error:', err);
        }
      };

      captureDevice();
    }
  }, [session]);

  // Synchronize current user session details to Cache Storage for PWA Service Worker background access
  useEffect(() => {
    if ('caches' in window) {
      if (session && (session.role === 'owner' || session.role === 'admin') && session.wing && session.flatNo) {
        const data = JSON.stringify({
          wing: session.wing,
          flatNo: session.flatNo,
          role: session.role
        });
        caches.open('orchid-user-cache').then((cache) => {
          cache.put('/current-user.json', new Response(data));
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'USER_SESSION_UPDATED' });
          }
        }).catch((err) => console.warn('Cache write failed:', err));
      } else {
        caches.open('orchid-user-cache').then((cache) => {
          cache.delete('/current-user.json');
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'USER_SESSION_UPDATED' });
          }
        }).catch((err) => console.warn('Cache delete failed:', err));
      }
    }
  }, [session]);

  const handleLoginSuccess = (userSession: UserSession) => {
    setSession(userSession);
    localStorage.setItem('orchid_gate_session', JSON.stringify(userSession));
    loadOwners(); // reload fresh directory data
    if (userSession.role === 'security') navigate('/security');
    else if (userSession.role === 'admin') navigate('/admin');
    else navigate('/home');
  };

  const handleLogout = async () => {
    if (session && session.wing && session.flatNo) {
      const flatKey = `${session.wing}_${session.flatNo}`;
      const deviceId = localStorage.getItem(`orchid_device_uuid_${flatKey}`);
      if (deviceId) {
        try {
          await (api as any).deregisterDevice(session.wing, session.flatNo, deviceId);
        } catch (err) {
          console.warn('Failed to deregister device on logout:', err);
        }
      }
    }
    setSession(null);
    localStorage.removeItem('orchid_gate_session');
    setActiveTab('directory');
  };

  // Validate active device registration state (handles admin remote signout)
  useEffect(() => {
    if (session && (session.role === 'owner' || session.role === 'admin') && session.wing && session.flatNo) {
      const validateDeviceSession = async () => {
        try {
          const flatKey = `${session.wing}_${session.flatNo}`;
          const deviceId = localStorage.getItem(`orchid_device_uuid_${flatKey}`);
          
          if (deviceId) {
            const ownersList = await api.getOwners();
            const myOwner = ownersList.find((o: any) => o.wing === session.wing && o.flatNo === session.flatNo);
            
            if (myOwner) {
              const registeredDevices = myOwner.devices || [];
              const isDeviceRegistered = registeredDevices.some((d: any) => d.deviceId === deviceId);
              
              if (!isDeviceRegistered) {
                console.warn('[Session Security] This device has been signed out remotely by Admin.');
                alert('🚫 This device has been signed out / removed from this flat by the administrator.');
                handleLogout();
              }
            }
          }
        } catch (err) {
          console.warn('[Session Security] Failed to validate device registration:', err);
        }
      };
      
      // Delay validation slightly to not block page loading
      const checkTimer = setTimeout(validateDeviceSession, 3000);
      return () => clearTimeout(checkTimer);
    }
  }, [session, owners]);

  return (
    <Routes>
      <Route
        path="/admin"
        element={
          <AdminPage
            owners={owners}
            onRefreshOwners={loadOwners}
            adminSession={adminSession}
            setAdminSession={setAdminSession}
          />
        }
      />
      <Route
        path="/*"
        element={
          loadingOwners && owners.length === 0 ? (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <div className="text-center space-y-4">
                <div className="inline-block border-4 border-indigo-600 border-t-transparent rounded-full w-10 h-10 animate-spin"></div>
                <p className="text-sm font-semibold text-slate-600 font-display">Powering up Orchid Heights Gatekeeper...</p>
              </div>
            </div>
          ) : !session ? (
            location.pathname !== '/login' ? (
              <Navigate to="/login" replace />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key="login-page"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                >
                  <Login onLoginSuccess={handleLoginSuccess} />
                </motion.div>
              </AnimatePresence>
            )
          ) : location.pathname === '/login' ? (
            <Navigate to="/" replace />
          ) : (
            <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-900">
              {/* Navigation Header */}
              <Navbar
                session={session}
                onLogout={handleLogout}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />

              {/* Main Layout Stage */}
              <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="w-full h-full"
                  >
                    {session.role === 'security' ? (
                      <SecurityDashboard
                        owners={owners}
                        onRefreshOwners={loadOwners}
                      />
                    ) : location.pathname === '/directory' ? (
                      <Directory
                        owners={owners}
                        session={session}
                      />
                    ) : (
                      <ResidentDashboard
                        session={session}
                        owners={owners}
                        onRefreshOwners={loadOwners}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>

              {/* Footer Branding Panel */}
              <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
                <div className="max-w-7xl mx-auto px-4 text-center space-y-1">
                  <p className="text-xs font-semibold text-slate-500">
                    Orchid Heights Gatekeeper • Smart Visitor Protection Panel
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Developed in high-fidelity full stack. All rights reserved. 
                  </p>
                </div>
              </footer>
            </div>
          )
        }
      />
    </Routes>
  );
}
