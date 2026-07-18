import React, { useState } from 'react';
import { ArrowLeft, Download, FileText, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { generateVisitorPDF } from '../../lib/pdfGenerator';
import { Visitor } from '../../types';

interface AdminVisitorRecordsProps {
  onBack: () => void;
}

export default function AdminVisitorRecords({ onBack }: AdminVisitorRecordsProps) {
  const [filterTime, setFilterTime] = useState<'today' | '1m' | '2m' | 'all'>('today');
  const [filterWing, setFilterWing] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [filterFlatNo, setFilterFlatNo] = useState<string>('');
  
  const [loading, setLoading] = useState(false);

  const fetchFilteredLogs = async (): Promise<Visitor[]> => {
    let list = await api.getVisitors({
      wing: filterWing !== 'ALL' ? filterWing : undefined,
      flatNo: filterFlatNo ? parseInt(filterFlatNo) : undefined,
      includeDeleted: true // Admin sees everything
    });

    const now = new Date();
    let cutoff = new Date();

    if (filterTime === 'today') {
      cutoff.setHours(0, 0, 0, 0);
    } else if (filterTime === '1m') {
      cutoff.setMonth(now.getMonth() - 1);
    } else if (filterTime === '2m') {
      cutoff.setMonth(now.getMonth() - 2);
    } else if (filterTime === 'all') {
      cutoff = new Date(0);
    }

    return list.filter(v => new Date(v.requestTime) >= cutoff);
  };

  const downloadCSV = async () => {
    setLoading(true);
    try {
      const reportData = await fetchFilteredLogs();
      const rows: string[] = [];
      rows.push(`"ORCHID HEIGHTS - MASTER ADMIN VISITOR REPORT"`);
      rows.push(`"Report Filter: ${filterTime.toUpperCase()} | Flat: ${filterWing === 'ALL' ? 'ALL' : filterWing + '-' + filterFlatNo}"`);
      rows.push(`"Generated: ${new Date().toLocaleString('en-IN')}"`);
      rows.push(`""`);
      rows.push([
        '"Sr."', '"Visitor Name"', '"Mobile Number"', '"Email"', '"Wing"', '"Flat No"',
        '"Visitor Type"', '"Reason"', '"Status"', '"Request Date"', '"Request Time"',
        '"Response Time"', '"Approved / Rejected By"', '"Rejection Reason"'
      ].join(','));

      reportData.forEach((v, idx) => {
        const reqDate = new Date(v.requestTime);
        const respDate = v.respondedTime ? new Date(v.respondedTime) : null;
        rows.push([
          `"${idx + 1}"`, `"${(v.fullName || '').replace(/"/g, '""')}"`, `"${v.mobileNumber || ''}"`,
          `"${(v.email || '').replace(/"/g, '""')}"`, `"${v.wing}"`, `"${v.flatNo}"`,
          `"${v.guestType || ''}"`, `"${(v.reason || '').replace(/"/g, '""')}"`,
          `"${(v.status || '').toUpperCase()}"`,
          `"${reqDate.toLocaleDateString('en-IN')}"`, `"${reqDate.toLocaleTimeString('en-IN')}"`,
          `"${respDate ? respDate.toLocaleString('en-IN') : '-'}"`,
          `"${(v.respondedBy || '-').replace(/"/g, '""')}"`, `"${(v.rejectReason || '-').replace(/"/g, '""')}"`
        ].join(','));
      });

      if (reportData.length === 0) {
        rows.push('"No visitor records found for the selected criteria."');
      }

      const csvString = rows.join('\r\n');
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Admin_Visitor_Logs_${new Date().getTime()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error fetching records.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    setLoading(true);
    try {
      const reportData = await fetchFilteredLogs();
      generateVisitorPDF(reportData, "MASTER ADMIN GATE REPORT", `Filter: ${filterTime.toUpperCase()} | Flat: ${filterWing === 'ALL' ? 'ALL' : filterWing + '-' + filterFlatNo}`);
    } catch (e) {
      alert('Error fetching records for PDF.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <button
          onClick={onBack}
          className="flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer transition select-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </button>
        <div className="flex items-center space-x-1 text-indigo-600">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-widest font-mono">
            Security Logs
          </span>
        </div>
      </div>

      <div>
        <h3 className="font-display font-black text-slate-800 text-lg">Gate Visitor Records (Admin)</h3>
        <p className="text-xs text-slate-400 font-medium mt-1">
          Export gate visitor logs securely. You can pull complete records across all flats, or filter by specific flats and timelines.
        </p>
      </div>

      <div className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Time Range</label>
            <select
              value={filterTime}
              onChange={(e) => setFilterTime(e.target.value as any)}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none text-slate-700"
            >
              <option value="today">📅 Today's Entries</option>
              <option value="1m">📊 Last 1 Month Logs</option>
              <option value="2m">📈 Last 2 Months Logs</option>
              <option value="all">🗂️ All-Time Logs</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Target Wing</label>
            <select
              value={filterWing}
              onChange={(e) => setFilterWing(e.target.value as any)}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none text-slate-700"
            >
              <option value="ALL">All Wings (Global)</option>
              <option value="A">Wing A</option>
              <option value="B">Wing B</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Flat No (Optional)</label>
            <input
              type="number"
              placeholder="e.g. 101"
              value={filterFlatNo}
              onChange={(e) => setFilterFlatNo(e.target.value)}
              disabled={filterWing === 'ALL'}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none text-slate-700 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <button
            onClick={downloadCSV}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl text-sm flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer select-none disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Search className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            <span>Download CSV (Spreadsheet)</span>
          </button>
          
          <button
            onClick={downloadPDF}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl text-sm flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer select-none disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Search className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            <span>Download PDF (With Photos)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
