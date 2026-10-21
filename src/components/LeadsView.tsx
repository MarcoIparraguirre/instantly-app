'use client';

import React, { useState, useEffect } from 'react';
import { Users, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Lead } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

export default function LeadsView() {
  const { t } = useLanguage();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'sheets' | 'csv'>('sheets');
  const [sheetUrl, setSheetUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [pasteData, setPasteData] = useState(
    'elon@tesla.com, Elon, Musk, Tesla\nsatya@microsoft.com, Satya, Nadella, Microsoft\nsundar@google.com, Sundar, Pichai, Google'
  );

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportCsv = async () => {
    const lines = pasteData.trim().split('\n');
    const parsed = lines
      .map(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 1 && parts[0].includes('@')) {
          return {
            email: parts[0],
            firstName: parts[1] || '',
            lastName: parts[2] || '',
            companyName: parts[3] || 'Company',
            campaignId: 'campaign-1'
          };
        }
        return null;
      })
      .filter(Boolean);

    if (parsed.length === 0) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      if (res.ok) {
        setShowImportModal(false);
        fetchLeads();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportSheet = async () => {
    if (!sheetUrl.trim()) return;

    setIsImporting(true);
    setImportStatus(null);

    try {
      const res = await fetch('/api/leads/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrlOrId: sheetUrl.trim(),
          campaignId: 'campaign-1'
        })
      });

      const data = await res.json();

      if (res.ok) {
        setImportStatus({
          type: 'success',
          message: `🎉 ${data.importedCount} ${t('leads.sheetsSuccess')}`
        });
        fetchLeads();
        setTimeout(() => {
          setShowImportModal(false);
          setImportStatus(null);
          setSheetUrl('');
        }, 1800);
      } else {
        setImportStatus({
          type: 'error',
          message: data.error || 'Failed to import from Google Sheets'
        });
      }
    } catch (err: any) {
      setImportStatus({
        type: 'error',
        message: err.message || 'Network error fetching Google Sheet'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return { label: t('leads.statusSent'), color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' };
      case 'opened':
        return { label: t('leads.statusOpened'), color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' };
      case 'replied':
        return { label: t('leads.statusReplied'), color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' };
      default:
        return { label: t('leads.statusPending'), color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', dot: 'bg-amber-400 animate-pulse' };
    }
  };

  return (
    <div className="flex-1 p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-5 h-5 text-blue-500" />
            {t('leads.title')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t('leads.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveTab('sheets');
              setShowImportModal(true);
            }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 border border-emerald-500/30 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t('leads.importSheetsBtn')}
          </button>

          <button
            onClick={() => {
              setActiveTab('csv');
              setShowImportModal(true);
            }}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition"
          >
            <Upload className="w-4 h-4" />
            {t('leads.importBtn')}
          </button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
            <tr>
              <th className="py-3 px-5">{t('leads.colEmail')}</th>
              <th className="py-3 px-5">{t('leads.colFirstName')}</th>
              <th className="py-3 px-5">{t('leads.colCompany')}</th>
              <th className="py-3 px-5">{t('leads.colStep')}</th>
              <th className="py-3 px-5">{t('leads.colStatus')}</th>
              <th className="py-3 px-5">{t('leads.colLastContacted')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-200">
            {leads.map((lead) => {
              const badge = getStatusBadge(lead.status);
              return (
                <tr key={lead.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-5 font-mono text-white font-medium">{lead.email}</td>
                  <td className="py-3 px-5 text-slate-300">{lead.firstName || '—'}</td>
                  <td className="py-3 px-5 text-slate-300">{lead.companyName || '—'}</td>
                  <td className="py-3 px-5 text-slate-400 font-mono">{t('campaignEditor.stepPrefix')} {lead.currentStep}</td>
                  <td className="py-3 px-5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${badge.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-slate-500 font-mono text-[11px]">
                    {lead.lastContactedAt
                      ? new Date(lead.lastContactedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                      : t('leads.notSentYet')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unified Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {activeTab === 'sheets' ? (
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Upload className="w-4 h-4 text-blue-400" />
                )}
                {t('leads.modalTitle')}
              </h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportStatus(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-800 gap-4 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('sheets')}
                className={`pb-2.5 flex items-center gap-2 transition ${
                  activeTab === 'sheets'
                    ? 'border-b-2 border-emerald-500 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                {t('leads.sheetsTab')}
              </button>
              <button
                onClick={() => setActiveTab('csv')}
                className={`pb-2.5 flex items-center gap-2 transition ${
                  activeTab === 'csv'
                    ? 'border-b-2 border-blue-500 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                {t('leads.csvTab')}
              </button>
            </div>

            {/* Tab 1: Google Sheets */}
            {activeTab === 'sheets' && (
              <div className="space-y-4 pt-1">
                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    {t('leads.sheetsUrlLabel')}
                  </label>
                  <input
                    type="text"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder={t('leads.sheetsUrlPlaceholder')}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono transition"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                    <span>💡</span> {t('leads.sheetsHelp')}
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-400 space-y-1">
                  <div className="text-slate-200 font-medium">Column mapping detected automatically:</div>
                  <div className="font-mono text-[11px] text-emerald-400/90">
                    email / correo, firstName / nombre, company / empresa, role...
                  </div>
                </div>

                {importStatus && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      importStatus.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {importStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{importStatus.message}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={isImporting || !sheetUrl.trim()}
                    onClick={handleImportSheet}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg shadow transition flex items-center gap-2"
                  >
                    {isImporting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    {t('leads.sheetsImportNow')}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: CSV / Text */}
            {activeTab === 'csv' && (
              <div className="space-y-4 pt-1">
                <p className="text-xs text-slate-400">
                  {t('leads.modalDesc')}
                </p>

                <textarea
                  rows={8}
                  value={pasteData}
                  onChange={(e) => setPasteData(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleImportCsv}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
                  >
                    {t('leads.importNow')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
