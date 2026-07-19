import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from '../../lib/firebase';
import { DailyHelper } from '../../types';
import { Plus, X, Edit2, Trash2, Camera, Search, User } from 'lucide-react';
import { compressImage } from '../../lib/imageCompressor';

export default function AdminLocalServices() {
  const [helpers, setHelpers] = useState<DailyHelper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'Maid' | 'Milkman' | 'Car Cleaner' | 'Newspaper Guy' | 'Other'>('Maid');
  const [photoUrl, setPhotoUrl] = useState('');
  const [flatsRaw, setFlatsRaw] = useState('');
  
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'daily_helpers'), (snap) => {
      const list: DailyHelper[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as DailyHelper));
      setHelpers(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !photoUrl) {
      alert("Name, Phone and Photo are required.");
      return;
    }

    const flatArr = flatsRaw.split(',').map(f => f.trim().toUpperCase()).filter(f => f.match(/^[AB]-\d{3,4}$/));

    const payload: any = {
      name: name.trim(),
      phone: phone.trim(),
      role,
      photoUrl,
      flats: flatArr
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'daily_helpers', editingId), payload);
      } else {
        const newId = 'dh_' + Math.random().toString(36).substr(2, 9);
        payload.id = newId;
        await setDoc(doc(db, 'daily_helpers', newId), payload);
      }
      resetForm();
    } catch (e) {
      alert("Error saving provider.");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setPhone('');
    setRole('Maid');
    setPhotoUrl('');
    setFlatsRaw('');
  };

  const handleEdit = (h: DailyHelper) => {
    setEditingId(h.id);
    setName(h.name);
    setPhone(h.phone);
    setRole(h.role);
    setPhotoUrl(h.photoUrl || '');
    setFlatsRaw((h.flats || []).join(', '));
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this provider globally?")) {
      await deleteDoc(doc(db, 'daily_helpers', id));
    }
  };

  const filtered = helpers.filter(h => (h.name || '').toLowerCase().includes(search.toLowerCase()) || (h.phone || '').includes(search) || (h.role || '').toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-8 text-center text-slate-500 font-bold">Loading Providers...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Local Service Providers</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Manage maids, milkmen, cleaners, and other daily helpers.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase transition flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Provider
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-left">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 uppercase tracking-tight">{editingId ? 'Edit Provider' : 'New Provider'}</h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="row-span-2 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 p-4">
              {photoUrl ? (
                <div className="relative">
                  <img src={photoUrl} className="w-24 h-24 object-cover rounded-xl shadow" alt="Preview" />
                  <button type="button" onClick={() => setPhotoUrl('')} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1"><X className="w-3 h-3"/></button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer text-pink-500 hover:text-pink-600">
                  <Camera className="w-8 h-8 mb-2" />
                  <span className="text-[10px] font-bold uppercase">Upload Photo *</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      compressImage(e.target.files[0], 400, 400, 0.7).then(setPhotoUrl);
                    }
                  }} />
                </label>
              )}
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Name *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold outline-none focus:border-pink-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mobile Number *</label>
                <input required type="text" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold outline-none focus:border-pink-500" />
              </div>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Role Type *</label>
              <select value={role} onChange={e => setRole(e.target.value as any)} className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold outline-none focus:border-pink-500">
                <option value="Maid">Maid</option>
                <option value="Milkman">Milkman</option>
                <option value="Car Cleaner">Car Cleaner</option>
                <option value="Newspaper Guy">Newspaper Guy</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assigned Flats (Comma Separated)</label>
              <input type="text" placeholder="e.g. A-101, B-202" value={flatsRaw} onChange={e => setFlatsRaw(e.target.value)} className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold outline-none focus:border-pink-500" />
            </div>
            
            <div className="md:col-span-2 pt-3 border-t border-slate-100 flex justify-end">
              <button type="submit" className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-2 rounded-xl font-bold uppercase text-[10px] tracking-wider transition shadow-sm">
                {editingId ? 'Save Changes' : 'Register Provider'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center">
          <Search className="w-4 h-4 text-slate-400 mr-2" />
          <input 
            type="text" 
            placeholder="Search by name, phone or role..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-xs font-semibold w-full placeholder:text-slate-400"
          />
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[9px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Flats Assigned</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filtered.map(h => (
                <tr key={h.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 flex items-center space-x-3">
                    <img src={h.photoUrl || 'https://i.ibb.co/zT5tpcdY/1000296229-1.png'} className="w-8 h-8 rounded-full object-cover border border-slate-200" alt="" />
                    <div>
                      <p className="font-bold text-slate-900">{h.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{h.phone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-pink-50 text-pink-700 border border-pink-100 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                      {h.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {h.flats?.length ? h.flats.map(f => (
                        <span key={f} className="bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold">
                          {f}
                        </span>
                      )) : <span className="text-slate-400 text-[10px] italic">Unassigned</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => handleEdit(h)} className="text-pink-500 hover:bg-pink-50 p-1.5 rounded transition"><Edit2 className="w-4 h-4"/></button>
                    <button onClick={() => handleDelete(h.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition"><Trash2 className="w-4 h-4"/></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-xs font-bold">No service providers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

