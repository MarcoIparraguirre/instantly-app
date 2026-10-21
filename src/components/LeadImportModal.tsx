'use client';

import React, { useState } from 'react';
import { 
  X, FileSpreadsheet, Upload, CheckCircle2, AlertCircle, 
  ExternalLink, Sparkles, RefreshCw, Layers
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { Lead } from '@/types';

interface LeadImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  onImportSuccess: (newLeads: Lead[], detectedColumns: string[]) => void;
}

export default function LeadImportModal({
  isOpen,
  onClose,
  campaignId,
  onImportSuccess
}: LeadImportModalProps) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'sheets' | 'csv'>('sheets');
  const [sheetUrl, setSheetUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ count: number; columns: string[] } | null>(null);

  const [csvText, setCsvText] = useState(
    'email, Nombre, Empresa, Cargo, Ciudad\nsofia.rodriguez@novacorp.com, Sofía, NovaCorp, Gerente Comercial, Madrid\nmarcos.gonzalez@fintechscale.io, Marcos, FintechScale, VP de Expansión, Bogotá\nvaleria.castro@biohealth.co, Valeria, BioHealth, Directora de Operaciones, Ciudad de México'
  );

  if (!isOpen) return null;

  const handleImportSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessInfo(null);

    try {
      const res = await fetch('/api/leads/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrlOrId: sheetUrl.trim(),
          campaignId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || (language === 'es' ? 'Error al conectar con la hoja' : 'Failed to connect sheet'));
      }

      setSuccessInfo({
        count: data.importedCount,
        columns: data.detectedColumns || []
      });

      if (data.leads && Array.isArray(data.leads)) {
        onImportSuccess(data.leads, data.detectedColumns || []);
      }

      setTimeout(() => {
        onClose();
        setSuccessInfo(null);
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error importando Google Sheet');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessInfo(null);

    try {
      const lines = csvText.trim().split(/\r?\n/);
      if (lines.length < 2) {
        throw new Error(language === 'es' ? 'Debes incluir al menos una fila de encabezados y un contacto' : 'Include at least headers and 1 contact row');
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const emailIdx = headers.findIndex(h => /^(email|correo|mail)$/i.test(h));

      if (emailIdx === -1) {
        throw new Error(language === 'es' ? 'Se requiere una columna llamada "email" o "correo"' : 'A column named "email" or "correo" is required');
      }

      const parsedLeads: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length === 0 || !parts[emailIdx] || !parts[emailIdx].includes('@')) continue;

        const customVars: Record<string, string> = {};
        let firstName = '';
        let lastName = '';
        let companyName = '';

        headers.forEach((header, idx) => {
          const val = parts[idx] || '';
          if (val) customVars[header] = val;

          const norm = header.toLowerCase();
          if (norm === 'nombre' || norm === 'firstname' || norm === 'first_name') firstName = val;
          if (norm === 'apellido' || norm === 'lastname' || norm === 'last_name') lastName = val;
          if (norm === 'empresa' || norm === 'company' || norm === 'companyname') companyName = val;
        });

        parsedLeads.push({
          campaignId,
          email: parts[emailIdx],
          firstName,
          lastName,
          companyName,
          customVariables: customVars
        });
      }

      if (parsedLeads.length === 0) {
        throw new Error(language === 'es' ? 'No se encontraron contactos con emails válidos' : 'No contacts with valid emails found');
      }

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedLeads)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save leads');

      setSuccessInfo({
        count: parsedLeads.length,
        columns: headers
      });

      onImportSuccess(data, headers);

      setTimeout(() => {
        onClose();
        setSuccessInfo(null);
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error importando CSV');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseDemoSheet = () => {
    // Demo sheet with columns: Email, Nombre, Empresa, Cargo, Ciudad
    setSheetUrl('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {language === 'es' ? 'Importar Base de Leads & Contactos' : 'Import Leads & Contacts Database'}
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'es' 
                  ? 'Conecta tu Google Sheets o pega tu lista. Todas tus columnas se respetan automáticamente.' 
                  : 'Connect your Google Sheet or paste CSV. All your columns are preserved for email variables.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/40 shrink-0">
          <button
            onClick={() => setActiveTab('sheets')}
            className={`py-3 px-4 font-semibold text-xs border-b-2 flex items-center gap-2 transition ${
              activeTab === 'sheets'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Google Sheets (Recomendado)</span>
          </button>
          <button
            onClick={() => setActiveTab('csv')}
            className={`py-3 px-4 font-semibold text-xs border-b-2 flex items-center gap-2 transition ${
              activeTab === 'csv'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>{language === 'es' ? 'Pegar / Subir CSV o Excel' : 'Paste CSV / Excel'}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: GOOGLE SHEETS */}
          {activeTab === 'sheets' && (
            <form onSubmit={handleImportSheet} className="space-y-4">
              {/* Instructions Box */}
              <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 text-xs space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>{language === 'es' ? 'Cómo conectar tu hoja en 3 pasos:' : 'How to connect your sheet in 3 steps:'}</span>
                </div>
                <ol className="text-slate-300 space-y-1.5 pl-4 list-decimal marker:text-emerald-500 text-[11px] leading-relaxed">
                  <li>
                    {language === 'es'
                      ? 'Abre tu hoja en Google Sheets con tus columnas (ej: Correo, Nombre, Empresa, Cargo, etc.).'
                      : 'Open your Google Sheet with your columns (e.g. Email, Name, Company, Title, etc.).'}
                  </li>
                  <li>
                    {language === 'es'
                      ? 'Haz clic en el botón superior derecho Compartir > Acceso general > "Cualquier persona con el enlace" (Lector).'
                      : 'Click the top right Share button > General access > "Anyone with the link" (Viewer).'}
                  </li>
                  <li>
                    {language === 'es'
                      ? 'Copia el enlace de la hoja, pégalo en el campo inferior y presiona "Conectar e Importar".'
                      : 'Copy the URL, paste it below and click "Connect & Import".'}
                  </li>
                </ol>
              </div>

              {/* URL Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    {language === 'es' ? 'Enlace de Google Sheets:' : 'Google Sheet URL:'}
                  </label>
                  <button
                    type="button"
                    onClick={handleUseDemoSheet}
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span>{language === 'es' ? 'Probar con hoja de demostración' : 'Test with demo sheet'}</span>
                  </button>
                </div>
                <input
                  type="url"
                  required
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !sheetUrl.trim()}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{language === 'es' ? 'Leyendo columnas y filas...' : 'Reading columns & rows...'}</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>{language === 'es' ? 'Conectar e Importar Leads' : 'Connect & Import Leads'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CSV / TEXT */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-xs text-slate-300">
                <p>
                  {language === 'es'
                    ? '💡 Pega tus filas separadas por comas. La primera fila define los nombres de tus columnas:'
                    : '💡 Paste comma-separated rows. The first row defines your column names:'}
                </p>
              </div>

              <div className="space-y-1.5">
                <textarea
                  rows={6}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleImportCsv}
                  disabled={isSubmitting || !csvText.trim()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{language === 'es' ? 'Importando...' : 'Importing...'}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>{language === 'es' ? 'Importar Contactos' : 'Import Contacts'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Feedback alerts */}
          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-300 animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">{language === 'es' ? 'No se pudo importar' : 'Import failed'}</div>
                <div className="text-[11px] leading-relaxed">{errorMsg}</div>
              </div>
            </div>
          )}

          {successInfo && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-3 text-xs text-emerald-300 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {language === 'es'
                    ? `¡Éxito! Se importaron ${successInfo.count} leads a esta campaña.`
                    : `Success! ${successInfo.count} leads imported into this campaign.`}
                </span>
              </div>

              {successInfo.columns.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-emerald-500/20">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {language === 'es'
                        ? 'Columnas listas para usar como variables en tus correos:'
                        : 'Columns ready to use as dynamic tags in your email copy:'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {successInfo.columns.map((col, idx) => (
                      <span
                        key={idx}
                        className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] px-2.5 py-1 rounded-lg"
                      >
                        {`{{${col}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
