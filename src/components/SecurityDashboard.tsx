/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Plus, Clock, Search, AlertCircle, CheckCircle2, Trash2, RefreshCw, Layers, Sparkles } from 'lucide-react';
import { FlatOwner, Visitor, DailyHelper } from '../types';
import WebcamCapture from './WebcamCapture';
import { api, detectServerEnvironment } from '../lib/api';
import { collection, onSnapshot, doc, setDoc, updateDoc, db, sendFCMPushToFlat } from '../lib/firebase';

const playDecisionSound = (status: 'approved' | 'rejected' | 'expired') => {
  if (status === 'expired') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    if (status === 'approved') {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
      osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.3);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);
    } else {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(220.00, now);
      osc1.frequency.linearRampToValueAtTime(146.83, now + 0.35);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);
    }
  } catch (err) {}
};

interface SecurityDashboardProps {
  owners: FlatOwner[];
  onRefreshOwners: () => void;
}

export default function SecurityDashboard({ owners, onRefreshOwners }: SecurityDashboardProps) {
  const [dailyHelpers, setDailyHelpers] = useState<DailyHelper[]>([]);
  const [selectedHelperId, setSelectedHelperId] = useState<string | null>(null);

  const [fullName, setFullName] = useState<string>('');
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [wing, setWing] = useState<'A' | 'B'>('A');
  const [flatNo, setFlatNo] = useState<number>(101);
  const [reason, setReason] = useState<string>('');
  const [guestType, setGuestType] = useState<string>('Delivery');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [visitorCount, setVisitorCount] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  const [selectedFlats, setSelectedFlats] = useState<string[]>(['A-101']);
  const [flatSearchQuery, setFlatSearchQuery] = useState<string>('');
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState<boolean>(false);

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [logsSearch, setLogsSearch] = useState<string>('');
  const [showStatusAlert, setShowStatusAlert] = useState<Visitor | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'daily_helpers'), (snapshot) => {
      const list: DailyHelper[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as DailyHelper);
      });
      setDailyHelpers(list);
    });
    return () => unsubscribe();
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await detectServerEnvironment();
      onRefreshOwners();
      await fetchVisitors();
    } catch (error) {} 
    finally {
      setIsRefreshing(false);
    }
  };

  const allSocietyFlats: string[] = [];
  ['A', 'B'].forEach((w) => {
    for (let floor = 1; floor <= 12; floor++) {
      for (let fIdx = 1; fIdx <= 4; fIdx++) {
        allSocietyFlats.push(`${w}-${floor * 100 + fIdx}`);
      }
    }
  });

  const currentOwner = owners.find((o) => o.wing === wing && o.flatNo === flatNo);
  const flatOwnerName = currentOwner && !currentOwner.nameEn.toLowerCase().includes('vacant')
    ? `${currentOwner.nameGu || currentOwner.nameEn}`
    : `Flat ${wing}-${flatNo}`;

  useEffect(() => {
    if (!isMultiSelectOpen && selectedFlats.length <= 1) {
      setSelectedFlats([`${wing}-${flatNo}`]);
    }
  }, [wing, flatNo, isMultiSelectOpen]);

  const fetchVisitors = async () => {
    try {
      const data = await api.getVisitors();
      if (Array.isArray(data)) {
        setVisitors((prev) => {
          data.forEach((newVis: Visitor) => {
            const oldVis = prev.find((v) => v.id === newVis.id);
            if (oldVis && oldVis.status === 'pending' && newVis.status !== 'pending') {
              setShowStatusAlert(newVis);
              playDecisionSound(newVis.status);
            }
          });
          return data;
        });
      }
    } catch (error) {}
  };

  useEffect(() => {
    const unsubscribe = api.subscribeAllVisitors(
      (data) => {
        setVisitors((prev) => {
          data.forEach((newVis: Visitor) => {
            const oldVis = prev.find((v) => v.id === newVis.id);
            if (oldVis && oldVis.status === 'pending' && newVis.status !== 'pending') {
              setShowStatusAlert(newVis);
              playDecisionSound(newVis.status);
            }
          });
          return data;
        });
      },
      () => {}
    );
    return () => unsubscribe();
  }, []);

  const handleDeleteVisitor = async (id: string, name: string) => {
    if (!window.confirm(`શું તમે ખરેખર "${name}" ની નોંધ ભૂંસી નાખવા માંગો છો?`)) return;
    try {
      await api.deleteVisitor(id);
      fetchVisitors();
    } catch (error) {
      alert('ભૂલ આવી. ફરી પ્રયાસ કરો.');
    }
  };

  const isDailyHelperType = ['Milkman', 'Maid', 'Vehicle Cleaner', 'Newspaper'].includes(guestType);

  const mappedHelpers = dailyHelpers.filter((h) => {
    if (guestType === 'Maid') return h.role === 'Maid';
    if (guestType === 'Milkman') return h.role === 'Milkman';
    if (guestType === 'Vehicle Cleaner') return h.role === 'Car Cleaner';
    if (guestType === 'Newspaper') return h.role === 'Newspaper Guy';
    return false;
  });

  const handleHelperSelectionChange = (helperId: string) => {
    setSelectedHelperId(helperId);
    if (!helperId || helperId === 'new') {
      setFullName('');
      setMobileNumber('');
      setPhotoUrl('');
      setSelectedFlats([`${wing}-${flatNo}`]);
      return;
    }
    const helper = dailyHelpers.find((h) => h.id === helperId);
    if (helper) {
      setFullName(helper.name);
      setMobileNumber(helper.phone);
      setPhotoUrl(helper.photoUrl || '');
      setSelectedFlats(helper.flats || []);
    }
  };

  const handleRegisterVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim() || !mobileNumber.trim()) {
      setFormError('કૃપા કરીને બધી વિગતો ભરો.');
      return;
    }
    if (selectedFlats.length === 0) {
      setFormError('કૃપા કરીને ઓછામાં ઓછો એક ફ્લેટ પસંદ કરો.');
      return;
    }
    if (!photoUrl) {
      setFormError('મુલાકાતીનો ફોટો લેવો ફરજિયાત છે.');
      return;
    }

    setSubmitting(true);
    try {
      const isBypassed = selectedHelperId && selectedHelperId !== 'new';
      const statusVal = isBypassed ? 'approved' : 'pending';

      for (const flatId of selectedFlats) {
        const parts = flatId.split('-');
        const fWing = parts[0] as 'A' | 'B';
        const fNo = parseInt(parts[1], 10);
        const owner = owners.find((o) => o.wing === fWing && o.flatNo === fNo);
        const ownerName = owner && !owner.nameEn.toLowerCase().includes('vacant')
          ? `${owner.nameGu || owner.nameEn}`
          : `Flat ${fWing}-${fNo}`;

        const visitorId = 'v_' + Math.random().toString(36).substr(2, 9);
        const defaultReason = isDailyHelperType ? `${guestType} Entry` : reason.trim() || 'General Visit';

        const newVisitor: any = {
          id: visitorId,
          fullName: fullName.trim(),
          mobileNumber: mobileNumber.trim(),
          email: email.trim() || '',
          wing: fWing,
          flatNo: fNo,
          reason: defaultReason,
          guestType,
          photoUrl: photoUrl || '',
          status: statusVal,
          requestTime: new Date().toISOString(),
          flatOwnerName: ownerName,
          visitorCount: isDailyHelperType ? 1 : visitorCount
        };

        if (statusVal === 'approved') {
          newVisitor.respondedTime = new Date().toISOString();
          newVisitor.respondedBy = 'System Auto-Bypass';
        }

        await setDoc(doc(db, 'visitors', visitorId), newVisitor);

        if (statusVal === 'pending') {
          await setDoc(doc(db, 'notifications', visitorId), {
            id: visitorId,
            type: 'visitor_request',
            wing: fWing,
            flatNo: fNo,
            visitorName: fullName.trim(),
            guestType,
            timestamp: new Date().toISOString(),
            acknowledged: false,
            status: 'pending'
          });

          // 🔔 Send FCM push to ALL devices of this flat immediately
          // This is what makes notification arrive even when app is closed
          sendFCMPushToFlat(fWing, fNo, {
            title: `🚪 ગેટ પર મુલાકાતી: ${fullName.trim()}`,
            body: `${guestType} - ${defaultReason}\nMobile: ${mobileNumber.trim()}`,
            icon: photoUrl || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png',
            data: {
              visitorId: String(visitorId),
              type: 'visitor',
              wing: String(fWing),
              flatNo: String(fNo),
              fullName: String(fullName.trim()),
              guestType: String(guestType),
              mobileNumber: String(mobileNumber.trim()),
              reason: String(defaultReason)
            }
          }).catch((err: any) => console.warn('[FCM] Push failed for flat:', fWing, fNo, err));
        }
      }

      if (isBypassed && selectedHelperId) {
        await updateDoc(doc(db, 'daily_helpers', selectedHelperId), {
          flats: selectedFlats
        });
        playDecisionSound('approved');
      }

      setFullName('');
      setMobileNumber('');
      setEmail('');
      setReason('');
      setPhotoUrl('');
      setVisitorCount(1);
      setSelectedHelperId(null);
      setSelectedFlats([`${wing}-${flatNo}`]);

      const trackerSection = document.getElementById('active-tracker');
      if (trackerSection) trackerSection.scrollIntoView({ behavior: 'smooth' });
    } catch (error: any) {
      setFormError('ભૂલ આવી. ફરી પ્રયાસ કરો.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFlatSelection = (flatId: string) => {
    setSelectedFlats((prev) => {
      if (prev.includes(flatId)) return prev.filter((f) => f !== flatId);
      return [...prev, flatId];
    });
  };

  const pendingVisitors = visitors.filter((v) => v.status === 'pending');
  const resolvedVisitors = visitors.filter((v) => v.status !== 'pending');

  const filteredLogs = resolvedVisitors.filter((v) => {
    const q = logsSearch.toLowerCase().trim();
    if (q === '') return true;
    return (
      v.fullName.toLowerCase().includes(q) ||
      v.mobileNumber.includes(q) ||
      `${v.wing}-${v.flatNo}`.toLowerCase().includes(q) ||
      v.reason.toLowerCase().includes(q) ||
      v.guestType.toLowerCase().includes(q)
    );
  });

  const filteredFlatsChecklist = allSocietyFlats.filter((fId) => {
    if (!flatSearchQuery.trim()) return true;
    return fId.toLowerCase().includes(flatSearchQuery.toLowerCase().trim());
  });

  return (
    <div className="space-y-8">
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm gap-4">
        <div className="text-left">
          <h1 className="font-display font-bold text-2xl text-slate-800 tracking-tight flex items-center space-x-2">
            <span className="inline-block w-3 h-3 bg-indigo-600 rounded-full animate-pulse"></span>
            <span>ગેટ સિક્યુરિટી કંટ્રોલ પેનલ</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">રહેવાસીઓની પરવાનગી મેળવવા માટેની લાઈવ સુરક્ષા સિસ્ટમ.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="w-full sm:w-auto bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 px-6 py-3 rounded-xl text-lg font-bold flex items-center justify-center space-x-2 transition shadow-sm"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isRefreshing ? 'લોડ થાય છે...' : 'રીફ્રેશ કરો'}</span>
          </button>
        </div>
      </div>
      
      {showStatusAlert && (
        <div className={`fixed inset-x-0 top-16 z-50 p-4 border-b animate-bounce ${
          showStatusAlert.status === 'approved' 
            ? 'bg-emerald-500 border-emerald-600 text-white' 
            : 'bg-red-500 border-red-600 text-white'
        } shadow-lg flex items-center justify-between`}>
          <div className="max-w-4xl mx-auto flex items-center space-x-4 w-full">
            <div className="bg-white p-3 rounded-full text-slate-900 shrink-0 shadow-md text-2xl">
              {showStatusAlert.status === 'approved' ? '✅' : '❌'}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm uppercase font-bold tracking-widest opacity-80">રહેવાસીનો જવાબ</p>
              <h4 className="text-xl font-bold">
                ફ્લેટ {showStatusAlert.wing}-{showStatusAlert.flatNo} એ <span className="underline">{showStatusAlert.status === 'approved' ? 'પ્રવેશ મંજૂર' : 'પ્રવેશ અસ્વીકાર'}</span> કર્યો છે 
                મુલાકાતી: <span className="font-extrabold">{showStatusAlert.fullName}</span> માટે!
              </h4>
            </div>
            <button
              onClick={() => setShowStatusAlert(null)}
              className="bg-white/20 hover:bg-white/35 border border-white/20 text-white font-bold text-lg px-6 py-3 rounded-xl transition"
            >
              સમજાઈ ગયું - ગેટ ખોલો
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-left">
          <div className="flex items-center space-x-4 mb-8 border-b border-slate-100 pb-5">
            <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-700">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h2 className="font-display font-bold text-2xl text-slate-800">નવી ગેટ એન્ટ્રી દાખલ કરો</h2>
              <p className="text-base text-slate-500">મુલાકાતીની વિગતો અહીં લખો.</p>
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl text-sm flex items-start space-x-2 mb-6 font-bold">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleRegisterVisitor} className="space-y-8">
            <WebcamCapture onPhotoCaptured={(base64) => setPhotoUrl(base64)} value={photoUrl} guestType={guestType} />

            {isDailyHelperType && (
              <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl space-y-4">
                <div className="flex items-center space-x-2 text-indigo-800">
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <span className="font-bold text-lg">રજિસ્ટર્ડ હેલ્પર ડાયરેક્ટરી</span>
                </div>
                <select
                  value={selectedHelperId || ''}
                  onChange={(e) => handleHelperSelectionChange(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-3 px-4 text-base font-bold outline-none"
                >
                  <option value="">-- રજિસ્ટર્ડ હેલ્પર પસંદ કરો --</option>
                  <option value="new" className="text-indigo-600">+ નવો હેલ્પર રજિસ્ટર કરો</option>
                  {mappedHelpers.map((h) => (
                    <option key={h.id} value={h.id}>{h.name} ({h.phone})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">મુલાકાતીનું નામ <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="મુલાકાતીનું આખું નામ લખો"
                  value={fullName}
                  disabled={!!(selectedHelperId && selectedHelperId !== 'new')}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-lg font-bold"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">મોબાઇલ નંબર <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  required
                  placeholder="૧૦-અંકનો મોબાઇલ નંબર લખો"
                  value={mobileNumber}
                  disabled={!!(selectedHelperId && selectedHelperId !== 'new')}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-lg font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">મુલાકાતીનો પ્રકાર <span className="text-red-500">*</span></label>
                <select
                  value={guestType}
                  onChange={(e) => setGuestType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-lg font-bold"
                >
                  <option value="Delivery">📦 ડિલિવરી / કુરિયર</option>
                  <option value="Guest">👋 મહેમાન / મિત્ર</option>
                  <option value="Electrician">⚡ ઇલેક્ટ્રિશિયન / કામકાજ</option>
                  <option value="Milkman">🥛 દૂધવાળો</option>
                  <option value="Maid">🧹 ઘરઘાટી / કામવાળા</option>
                  <option value="Vehicle Cleaner">🚗 ગાડી સાફ કરવાવાળા</option>
                  <option value="Newspaper">📰 પેપરવાળો</option>
                  <option value="Cabinet">🛠️ સર્વિસ એજન્ટ</option>
                  <option value="Other">👤 અન્ય મુલાકાતી</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">વિંગ <span className="text-red-500">*</span></label>
                  <select
                    value={wing}
                    onChange={(e) => setWing(e.target.value as 'A' | 'B')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-lg font-bold"
                  >
                    <option value="A">Wing A</option>
                    <option value="B">Wing B</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">FLAT નંબર <span className="text-red-500">*</span></label>
                  <select
                    value={flatNo}
                    onChange={(e) => setFlatNo(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-lg font-bold"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).flatMap((floor) =>
                      Array.from({ length: 4 }, (_, j) => floor * 100 + (j + 1))
                    ).map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="border border-slate-300 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setIsMultiSelectOpen(!isMultiSelectOpen)}
                className="w-full bg-slate-100 hover:bg-slate-200 py-4 px-5 flex items-center justify-between text-base font-bold text-slate-800 transition"
              >
                <div className="flex items-center space-x-3">
                  <Layers className="w-6 h-6 text-indigo-600" />
                  <span>ટાર્ગેટ ફ્લેટ પસંદ કરો (મલ્ટી-સિલેક્ટ)</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="bg-indigo-200 text-indigo-800 px-3 py-1 rounded-full text-sm">{selectedFlats.length} પસંદ કરેલ</span>
                  <span>{isMultiSelectOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isMultiSelectOpen && (
                <div className="p-5 space-y-5 bg-white text-left">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="ફ્લેટ શોધો..."
                        value={flatSearchQuery}
                        onChange={(e) => setFlatSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 pl-12 pr-4 text-base outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-60 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                    {filteredFlatsChecklist.map((flatId) => {
                      const isChecked = selectedFlats.includes(flatId);
                      return (
                        <button
                          type="button"
                          key={flatId}
                          onClick={() => toggleFlatSelection(flatId)}
                          className={`py-2 rounded text-xs font-bold border transition-all text-center ${
                            isChecked ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-300 text-slate-700'
                          }`}
                        >
                          {flatId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Show all selected flat owners */}
            <div className="bg-slate-100 p-5 rounded-2xl border border-slate-200 space-y-2">
              <p className="text-sm text-slate-500 font-bold">
                {selectedFlats.length === 1 ? 'લક્ષ્ય ફ્લેટના માલિક' : `${selectedFlats.length} ફ્લેટ પસંદ - માલિક સૂચિ`}
              </p>
              {selectedFlats.length <= 1 ? (
                <p className="text-xl font-bold text-slate-800">{flatOwnerName}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {selectedFlats.map((fId) => {
                    const parts = fId.split('-');
                    const fWing = parts[0] as 'A' | 'B';
                    const fNo = parseInt(parts[1], 10);
                    const owner = owners.find((o) => o.wing === fWing && o.flatNo === fNo);
                    const oName = owner && !owner.nameEn.toLowerCase().includes('vacant')
                      ? (owner.nameGu || owner.nameEn)
                      : 'Vacant';
                    return (
                      <div key={fId} className="bg-white border border-indigo-100 rounded-xl px-3 py-2 flex items-center space-x-2">
                        <span className="text-[10px] font-black font-mono bg-indigo-600 text-white px-2 py-0.5 rounded">{fId}</span>
                        <span className="text-sm font-bold text-slate-800 truncate">{oName}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>


            {!isDailyHelperType && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">મુલાકાત લેવાનું કારણ <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">મુલાકાતીઓની સંખ્યા <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={visitorCount}
                    onChange={(e) => setVisitorCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 px-4 text-lg font-bold"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-5 px-6 rounded-2xl text-xl shadow-lg transition flex items-center justify-center space-x-3"
            >
              {submitting ? (
                <span className="inline-block border-4 border-white border-t-transparent rounded-full w-8 h-8 animate-spin"></span>
              ) : (
                <>
                  <Plus className="w-8 h-8" />
                  <span>
                    {selectedHelperId && selectedHelperId !== 'new' ? 'નોંધણી કરો અને પ્રવેશ મંજૂર કરો' : 'રહેવાસીને પરવાનગી માટે મોકલો'}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        <div id="active-tracker" className="bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-left h-full">
          <div className="flex items-center justify-between mb-8 pb-5 border-b border-slate-100">
            <div>
              <h3 className="font-display font-bold text-2xl text-slate-800">ચાલુ મંજૂરીઓનું લિસ્ટ</h3>
              <p className="text-base text-slate-500 mt-1">મોકલેલી વિનંતીઓની લાઈવ સ્થિતિ.</p>
            </div>
            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-lg font-bold px-4 py-2 rounded-full flex items-center space-x-2">
              <span className="w-3 h-3 bg-amber-500 rounded-full animate-ping"></span>
              <span>{pendingVisitors.length} બાકી</span>
            </span>
          </div>

          {pendingVisitors.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <CheckCircle2 className="w-16 h-16 text-emerald-200 mx-auto mb-4" />
              <p className="text-xl font-bold text-slate-700">કોઈ બાકી વિનંતી નથી</p>
            </div>
          ) : (
            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
              {pendingVisitors.map((v) => (
                <div key={v.id} className="bg-amber-50 border-l-8 border-amber-500 p-5 rounded-2xl relative animate-fade-in">
                  <button onClick={() => handleDeleteVisitor(v.id, v.fullName)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 p-2 bg-white rounded-xl shadow-sm">
                    <Trash2 className="w-6 h-6" />
                  </button>
                  <div className="flex items-center space-x-4 mb-4">
                    <img src={v.photoUrl} className="w-20 h-20 rounded-xl object-cover bg-slate-200 border-2 border-white shadow-sm" />
                    <div>
                      <span className="text-xl font-bold text-slate-900">{v.fullName}</span>
                      <p className="text-lg text-slate-600 font-bold">ફ્લેટ {v.wing}-{v.flatNo}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-amber-700 font-bold bg-amber-200 py-2 px-4 rounded-xl w-max animate-pulse">
                    <span>રાહ જુઓ...</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ===== TODAY'S COMPLETED GATE ENTRIES FOR SECURITY ===== */}
          <div className="mt-8 pt-8 border-t border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display font-bold text-xl text-slate-800">આજના પૂર્ણ થયેલ પ્રવેશ</h3>
                <p className="text-sm text-slate-500 mt-1">આજના બધા મંજૂર કે અસ્વીકાર થયેલ મુલાકાતીઓ.</p>
              </div>
              <span className="bg-indigo-150 text-indigo-800 border border-indigo-200 text-sm font-bold px-3 py-1.5 rounded-full">
                {filteredLogs.filter(v => {
                  const todayStr = new Date().toDateString();
                  return new Date(v.requestTime).toDateString() === todayStr;
                }).length} મુલાકાતીઓ
              </span>
            </div>

            {/* Logs Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="નામ, ફોન કે ફ્લેટ નંબરથી શોધો..."
                value={logsSearch}
                onChange={(e) => setLogsSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-10 pr-4 text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {filteredLogs.filter(v => {
              const todayStr = new Date().toDateString();
              return new Date(v.requestTime).toDateString() === todayStr;
            }).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">આજે હજી સુધી કોઈ વિનંતી પૂરી થઈ નથી.</p>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {filteredLogs.filter(v => {
                  const todayStr = new Date().toDateString();
                  return new Date(v.requestTime).toDateString() === todayStr;
                }).map((v) => (
                  <div 
                    key={v.id} 
                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 text-sm ${
                      v.status === 'approved' ? 'border-emerald-100 bg-emerald-50/20' : 'border-red-100 bg-red-50/20'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <img src={v.photoUrl || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'} className="w-12 h-12 rounded-lg object-cover bg-slate-200 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{v.fullName}</p>
                        <p className="text-xs text-slate-500 font-semibold">
                          ફ્લેટ {v.wing}-{v.flatNo} • {v.guestType} • {new Date(v.requestTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                        v.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {v.status === 'approved' ? 'મંજૂર' : 'અસ્વીકાર'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

