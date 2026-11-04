'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Layers,
  CheckSquare,
  Square,
  ArrowLeft,
  ArrowRight,
  FileText,
  ShieldCheck,
  Mail
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { Lead } from '@/types';
import { GoogleSheetsService } from '@/core/services/GoogleSheetsService';

interface LeadImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  onImportSuccess: (newLeads: Lead[], detectedColumns: string[]) => void;
}

interface SyncSummary {
  newAddedCount: number;
  updatedPendingCount: number;
  skippedSentCount: number;
  totalProcessed: number;
  selectedColumns: string[];
}

export default function LeadImportModal({
  isOpen,
  onClose,
  campaignId,
  onImportSuccess
}: LeadImportModalProps) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'sheets' | 'csv'>('sheets');
  const [wizardStep, setWizardStep] = useState<'source' | 'columns' | 'done'>('source');

  // Source Step states
  const [sheetUrl, setSheetUrl] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [showRawCsvInput, setShowRawCsvInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsed Preview & Column Selection states
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [emailColumn, setEmailColumn] = useState<string>('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Status states
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  if (!isOpen) return null;

  const resetModalState = () => {
    setWizardStep('source');
    setErrorMsg(null);
    setSyncSummary(null);
    setParsedRows([]);
    setDetectedColumns([]);
    setSelectedColumns([]);
    setEmailColumn('');
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  // Transition to Step 2 with rows & detected columns
  const prepareColumnSelection = (
    rows: Record<string, string>[],
    cols: string[],
    suggestedEmailCol?: string
  ) => {
    const sheetsService = new GoogleSheetsService();
    const finalCols = cols.length > 0 ? cols : sheetsService.getDetectedColumns(rows);
    const detectedEmail = suggestedEmailCol || sheetsService.detectEmailColumn(finalCols, rows);

    setParsedRows(rows);
    setDetectedColumns(finalCols);
    setEmailColumn(detectedEmail);
    // By default select all columns so user can uncheck whichever they don't want, or click Deselect All
    setSelectedColumns(finalCols);
    setErrorMsg(null);
    setWizardStep('columns');
  };

  // Option A: Read Public Google Sheet -> Step 2
  const handleFetchSheetPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;

    setIsLoadingPreview(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/leads/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrlOrId: sheetUrl.trim(),
          campaignId,
          previewOnly: true
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            (language === 'es' ? 'Error al leer la hoja de Google Sheets' : 'Failed to read Google Sheet')
        );
      }

      prepareColumnSelection(
        data.rows || [],
        data.detectedColumns || [],
        data.suggestedEmailColumn
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Error leyendo Google Sheet');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Option B: Read Uploaded CSV File or Pasted CSV Text -> Step 2
  const processCsvString = (rawContent: string, fileName?: string) => {
    setErrorMsg(null);
    try {
      const sheetsService = new GoogleSheetsService();
      const rows = sheetsService.parseCsvToRecords(rawContent);
      if (rows.length === 0) {
        throw new Error(
          language === 'es'
            ? 'El archivo CSV no contiene filas válidas. Asegúrate de incluir una primera fila con los nombres de las columnas y al menos una fila de datos.'
            : 'CSV file has no valid rows. Include a header row and at least 1 data row.'
        );
      }
      const cols = sheetsService.getDetectedColumns(rows);
      if (fileName) setUploadedFileName(fileName);
      setCsvText(rawContent);
      prepareColumnSelection(rows, cols);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar el archivo CSV');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      processCsvString(content, file.name);
    };
    reader.onerror = () => {
      setErrorMsg(language === 'es' ? 'No se pudo leer el archivo seleccionado.' : 'Could not read selected file.');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      processCsvString(content, file.name);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const toggleColumnSelection = (col: string) => {
    setSelectedColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleSelectAllColumns = () => {
    setSelectedColumns([...detectedColumns]);
  };

  const handleDeselectAllColumns = () => {
    setSelectedColumns([]);
  };

  // Step 2 -> Final Sync to Supabase
  const handleSyncLeads = async () => {
    if (!emailColumn) {
      setErrorMsg(
        language === 'es'
          ? 'Selecciona cuál es la columna que contiene el Email de los destinatarios.'
          : 'Please select the column containing recipient Email addresses.'
      );
      return;
    }

    setIsSyncing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/leads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          rows: parsedRows,
          emailColumn,
          selectedColumns
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al sincronizar contactos');
      }

      setSyncSummary({
        newAddedCount: data.newAddedCount ?? 0,
        updatedPendingCount: data.updatedPendingCount ?? 0,
        skippedSentCount: data.skippedSentCount ?? 0,
        totalProcessed: data.totalProcessed ?? 0,
        selectedColumns: data.selectedColumns || selectedColumns
      });

      setWizardStep('done');

      if (data.leads && Array.isArray(data.leads)) {
        onImportSuccess(data.leads, data.selectedColumns || selectedColumns);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al sincronizar contactos');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  {language === 'es'
                    ? 'Importar y Sincronizar Contactos'
                    : 'Import & Sync Contacts Database'}
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {wizardStep === 'source'
                    ? language === 'es'
                      ? 'Paso 1 de 2: Origen'
                      : 'Step 1 of 2: Source'
                    : wizardStep === 'columns'
                    ? language === 'es'
                      ? 'Paso 2 de 2: Elegir Columnas'
                      : 'Step 2 of 2: Select Columns'
                    : language === 'es'
                    ? 'Sincronizado'
                    : 'Synced'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {language === 'es'
                  ? 'Conecta tu Google Sheets público o sube un archivo .CSV y elige exactamente qué columnas usar en tu campaña.'
                  : 'Connect a public Google Sheet or upload a .CSV file and choose which columns to use in your campaign.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: CHOOSE SOURCE (GOOGLE SHEETS OR CSV FILE) */}
        {wizardStep === 'source' && (
          <>
            {/* Tab Switcher */}
            <div className="flex border-b border-slate-800 px-6 bg-slate-950/40 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('sheets');
                  setErrorMsg(null);
                }}
                className={`py-3.5 px-4 font-semibold text-xs border-b-2 flex items-center gap-2 transition cursor-pointer ${
                  activeTab === 'sheets'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>
                  {language === 'es'
                    ? 'Opción 1: Google Sheets Público'
                    : 'Option 1: Public Google Sheets'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('csv');
                  setErrorMsg(null);
                }}
                className={`py-3.5 px-4 font-semibold text-xs border-b-2 flex items-center gap-2 transition cursor-pointer ${
                  activeTab === 'csv'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>
                  {language === 'es'
                    ? 'Opción 2: Subir Archivo .CSV'
                    : 'Option 2: Upload .CSV File'}
                </span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* TAB 1: GOOGLE SHEETS */}
              {activeTab === 'sheets' && (
                <form onSubmit={handleFetchSheetPreview} className="space-y-4">
                  <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 text-xs space-y-2">
                    <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {language === 'es'
                          ? 'Sincronización Inteligente con Google Sheets:'
                          : 'Smart Google Sheets Synchronization:'}
                      </span>
                    </div>
                    <ol className="text-slate-300 space-y-1.5 pl-4 list-decimal marker:text-emerald-500 text-[11px] leading-relaxed">
                      <li>
                        {language === 'es'
                          ? 'En tu hoja de Google Sheets, haz clic en Compartir > Acceso general > "Cualquier persona con el enlace (Lector)".'
                          : 'In your Google Sheet, click Share > General access > "Anyone with the link (Viewer)".'}
                      </li>
                      <li>
                        {language === 'es'
                          ? 'Pega el enlace abajo. En el siguiente paso podrás marcar con tildes qué columnas puntuales quieres usar.'
                          : 'Paste the link below. In the next step you will choose which specific columns to use.'}
                      </li>
                      <li>
                        {language === 'es'
                          ? 'Cuando tu hoja crezca con filas nuevas, vuelve a sincronizarla aquí: el sistema solo enviará correos a los registros nuevos sin repetir los ya enviados.'
                          : 'When your sheet grows with new rows, re-sync here: only new records will be queued, never repeating already sent emails.'}
                      </li>
                    </ol>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      {language === 'es'
                        ? 'Enlace de tu archivo público de Google Sheets:'
                        : 'Public Google Sheet URL:'}
                    </label>
                    <input
                      type="url"
                      required
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1X7c.../edit#gid=0"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isLoadingPreview || !sheetUrl.trim()}
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                    >
                      {isLoadingPreview ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>
                            {language === 'es'
                              ? 'Leyendo columnas de la hoja...'
                              : 'Reading sheet columns...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            {language === 'es'
                              ? 'Leer Hoja y Elegir Columnas'
                              : 'Read Sheet & Choose Columns'}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: UPLOAD CSV FILE */}
              {activeTab === 'csv' && (
                <div className="space-y-4">
                  {/* File Drag & Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDropFile}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                      isDragging
                        ? 'border-blue-400 bg-blue-500/10'
                        : 'border-slate-700/80 hover:border-blue-500/60 bg-slate-900/50 hover:bg-slate-900/80'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white">
                        {uploadedFileName
                          ? `${language === 'es' ? 'Archivo cargado:' : 'Loaded file:'} ${uploadedFileName}`
                          : language === 'es'
                          ? 'Haz clic para seleccionar un archivo .CSV o arrástralo aquí'
                          : 'Click to select a .CSV file or drag and drop it here'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {language === 'es'
                          ? 'Soporta archivos CSV exportados de Excel o Google Sheets (separados por comas o punto y coma).'
                          : 'Supports CSV files exported from Excel or Google Sheets (comma or semicolon separated).'}
                      </p>
                    </div>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-xl">
                      <FileText className="w-3.5 h-3.5" />
                      {language === 'es' ? 'Examinar archivo .CSV en mi equipo' : 'Browse .CSV file'}
                    </span>
                  </div>

                  {/* Optional Manual CSV Text Paste Toggle */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowRawCsvInput(!showRawCsvInput)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      {showRawCsvInput
                        ? language === 'es'
                          ? 'Ocultar cuadro de texto manual'
                          : 'Hide manual text box'
                        : language === 'es'
                        ? '¿Prefieres pegar el texto CSV manualmente?'
                        : 'Prefer to paste CSV text manually?'}
                    </button>

                    {showRawCsvInput && (
                      <div className="mt-3 space-y-3">
                        <textarea
                          rows={5}
                          value={csvText}
                          onChange={(e) => setCsvText(e.target.value)}
                          placeholder={
                            'MAIL, Nombre, Empresa, DOLOR, ASUNTO\ncontacto@empresa.com, Juan, Acme, Demora en entregas, Propuesta para Acme'
                          }
                          className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none leading-relaxed"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => processCsvString(csvText, 'Texto CSV Manual')}
                            disabled={!csvText.trim()}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                          >
                            <span>
                              {language === 'es'
                                ? 'Analizar Texto y Elegir Columnas'
                                : 'Parse Text & Choose Columns'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-300 animate-in fade-in">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold">
                      {language === 'es' ? 'Aviso de lectura' : 'Read notice'}
                    </div>
                    <div className="text-[11px] leading-relaxed">{errorMsg}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* STEP 2: INTERACTIVE COLUMN SELECTOR & PREVIEW */}
        {wizardStep === 'columns' && (
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* Top summary bar with Back button */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setWizardStep('source');
                    setErrorMsg(null);
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Cambiar origen' : 'Change source'}</span>
                </button>
                <div className="text-xs">
                  <span className="font-bold text-white">{parsedRows.length}</span>{' '}
                  <span className="text-slate-400">
                    {language === 'es' ? 'registros leídos' : 'rows detected'}
                  </span>
                  <span className="mx-2 text-slate-600">•</span>
                  <span className="font-bold text-emerald-400">{detectedColumns.length}</span>{' '}
                  <span className="text-slate-400">
                    {language === 'es' ? 'columnas encontradas' : 'columns found'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>
                  {language === 'es'
                    ? 'Los contactos ya enviados se protegerán automáticamente'
                    : 'Already sent contacts will be protected automatically'}
                </span>
              </div>
            </div>

            {/* 1. Mandatory Email Column Selector */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <span>
                    {language === 'es'
                      ? '1. ¿Cuál es la columna que contiene la dirección de Email?'
                      : '1. Which column contains the Email address?'}
                  </span>
                </label>
                <select
                  value={emailColumn}
                  onChange={(e) => setEmailColumn(e.target.value)}
                  className="bg-slate-950 border border-blue-500/50 focus:border-blue-400 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none"
                >
                  {detectedColumns.map(col => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
              {parsedRows[0] && emailColumn && (
                <p className="text-[11px] text-slate-400">
                  {language === 'es' ? 'Ejemplo detectado en fila 1:' : 'Sample from row 1:'}{' '}
                  <span className="font-mono text-blue-300 font-semibold">
                    {parsedRows[0][emailColumn] || '(vacío)'}
                  </span>
                </p>
              )}
            </div>

            {/* 2. Interactive Checkboxes for Campaign Variables */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>
                      {language === 'es'
                        ? '2. Selecciona qué columnas quieres importar y usar como variables en tu campaña:'
                        : '2. Select which columns to import and use as variables in your campaign:'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {language === 'es'
                      ? 'Solo las columnas marcadas se guardarán en la tabla de la campaña y aparecerán como botones {{Variable}} en el editor.'
                      : 'Only checked columns will be saved to the campaign table and shown as {{Variable}} tags in the editor.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleSelectAllColumns}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    {language === 'es' ? 'Marcar todas' : 'Select all'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllColumns}
                    className="text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    {language === 'es' ? 'Desmarcar todas' : 'Deselect all'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1 max-h-52 overflow-y-auto pr-1">
                {detectedColumns.map(col => {
                  const isChecked = selectedColumns.includes(col);
                  const isEmailCol = col === emailColumn;
                  const sampleVal =
                    parsedRows.find(r => (r[col] || '').trim().length > 0)?.[col] || '';

                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => toggleColumnSelection(col)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold truncate">
                            {`{{${col}}}`}
                          </span>
                          {isEmailCol && (
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 bg-blue-500/20 text-blue-300 rounded">
                              Email
                            </span>
                          )}
                        </div>
                        <p
                          className="text-[10px] text-slate-400 truncate mt-0.5"
                          title={sampleVal}
                        >
                          {sampleVal ? `Ej: ${sampleVal}` : '(Sin vista previa)'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Live Table Preview of Selected Columns */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  {language === 'es'
                    ? 'Vista previa de cómo quedará tu tabla en la campaña (primeros 3 registros):'
                    : 'Preview of your campaign table (first 3 records):'}
                </span>
                <span className="text-[11px] text-emerald-400 font-mono">
                  {selectedColumns.length}{' '}
                  {language === 'es' ? 'variables seleccionadas' : 'variables selected'}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 font-bold text-blue-400">
                          ✉ {emailColumn || 'Email'}
                        </th>
                        {selectedColumns
                          .filter(c => c !== emailColumn)
                          .map(col => (
                            <th key={col} className="py-2.5 px-3 font-mono text-emerald-400 border-l border-slate-800">
                              {`{{${col}}}`}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-slate-300">
                      {parsedRows.slice(0, 3).map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="py-2 px-3 font-mono text-white font-medium">
                            {row[emailColumn] || '-'}
                          </td>
                          {selectedColumns
                            .filter(c => c !== emailColumn)
                            .map(col => (
                              <td
                                key={col}
                                className="py-2 px-3 max-w-[200px] truncate border-l border-slate-800/50 text-slate-300"
                                title={row[col] || ''}
                              >
                                {row[col] || '-'}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-300">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>{errorMsg}</div>
              </div>
            )}

            {/* Action Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setWizardStep('source')}
                className="text-xs text-slate-400 hover:text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                {language === 'es' ? '← Atrás' : '← Back'}
              </button>

              <button
                type="button"
                onClick={handleSyncLeads}
                disabled={isSyncing || !emailColumn}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-lg shadow-emerald-600/25 transition cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>
                      {language === 'es'
                        ? 'Sincronizando tabla de contactos...'
                        : 'Syncing contacts table...'}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {language === 'es'
                        ? `Sincronizar e Importar Contactos (${selectedColumns.length} columnas)`
                        : `Sync & Import Contacts (${selectedColumns.length} columns)`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SYNC SUMMARY */}
        {wizardStep === 'done' && syncSummary && (
          <div className="p-6 space-y-5">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2.5 font-bold text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {language === 'es'
                    ? '¡Tabla de la campaña sincronizada con éxito!'
                    : 'Campaign table synchronized successfully!'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">
                    {language === 'es' ? 'Nuevos (Pendientes de envío)' : 'New (Pending send)'}
                  </div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    +{syncSummary.newAddedCount}
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">
                    {language === 'es' ? 'Pendientes Actualizados' : 'Updated Pending'}
                  </div>
                  <div className="text-xl font-bold text-blue-400 mt-1">
                    {syncSummary.updatedPendingCount}
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">
                    {language === 'es' ? 'Ya Enviados (Protegidos)' : 'Already Sent (Protected)'}
                  </div>
                  <div className="text-xl font-bold text-amber-400 mt-1">
                    {syncSummary.skippedSentCount}
                  </div>
                </div>
              </div>

              {syncSummary.selectedColumns.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-emerald-500/20">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {language === 'es'
                        ? 'Variables habilitadas para tus plantillas de correo:'
                        : 'Variables enabled for your email templates:'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {syncSummary.selectedColumns.map((col, idx) => (
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

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer"
              >
                {language === 'es' ? 'Listo, volver a la campaña' : 'Done, return to campaign'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
