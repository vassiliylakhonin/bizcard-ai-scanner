import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Edit2, Check, RefreshCw, FileText, IdCard } from 'lucide-react';
import { BusinessCard, ProcessedFrame } from '../types';

const CARD_FIELDS: Array<keyof BusinessCard> = [
  'name',
  'company',
  'title',
  'email',
  'phone',
  'website',
  'address',
];

interface ResultsTableProps {
  frames: ProcessedFrame[];
  onRetry: () => void;
  onOpenSettings: () => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ frames, onRetry, onOpenSettings }) => {
  // Only show frames that were selected and processed successfully (or have data)
  const failedFrames = frames.filter((f) => f.isSelected && f.status === 'error');
  const validFrames = frames.filter((f) => f.isSelected && f.status === 'completed' && f.data);
  const failedMessages = Array.from(
    new Set(
      failedFrames
        .map((f) => (f.errorMessage || "").trim())
        .filter(Boolean),
    ),
  );
  const hasMissingKeyError = failedMessages.some((m) => /missing gemini api key/i.test(m));
  const [data, setData] = useState<BusinessCard[]>(validFrames.map((f) => f.data!));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dedupeEnabled, setDedupeEnabled] = useState<boolean>(true);

  useEffect(() => {
    const nextValid = frames
      .filter((f) => f.isSelected && f.status === 'completed' && f.data)
      .map((f) => f.data!);
    setData(nextValid);
    setEditingId(null);
  }, [frames]);

  const normalizeEmail = (s: string) => s.trim().toLowerCase();
  const normalizePhone = (s: string) => s.replace(/[^\d+]/g, '');
  const normalizeKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const isValidEmail = (email: string) => {
    const v = email.trim();
    if (!v) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const isValidPhone = (phone: string) => {
    const v = normalizePhone(phone);
    if (!v) return true;
    const digits = v.replace(/[^\d]/g, '');
    return digits.length >= 7 && digits.length <= 20;
  };

  const isValidUrl = (url: string) => {
    const v = url.trim();
    if (!v) return true;
    try {
      // Allow missing scheme by assuming https://
      new URL(v.includes('://') ? v : `https://${v}`);
      return true;
    } catch {
      return false;
    }
  };

  const dedupeResult = useMemo(() => {
    if (!dedupeEnabled) return { rows: data, removed: 0 };

    const mergeCards = (cards: BusinessCard[]): BusinessCard => {
      const base: BusinessCard = { ...cards[0] };
      for (const c of cards.slice(1)) {
        for (const field of CARD_FIELDS) {
          const cur = (base[field] || '').toString().trim();
          const next = (c[field] || '').toString().trim();
          if (!cur && next) base[field] = next;
        }
      }
      return base;
    };

    const groups = new Map<string, BusinessCard[]>();
    for (const card of data) {
      const email = normalizeEmail(card.email || '');
      const phone = normalizePhone(card.phone || '');
      const key =
        email ? `e:${email}` :
        phone ? `p:${phone}` :
        `n:${normalizeKey(card.name || '')}|c:${normalizeKey(card.company || '')}`;
      const arr = groups.get(key) || [];
      arr.push(card);
      groups.set(key, arr);
    }

    const rows: BusinessCard[] = [];
    let removed = 0;
    for (const [, cards] of groups) {
      if (cards.length === 1) {
        rows.push(cards[0]);
      } else {
        rows.push(mergeCards(cards));
        removed += cards.length - 1;
      }
    }

    return { rows, removed };
  }, [data, dedupeEnabled]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(dedupeResult.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Business Cards");
    XLSX.writeFile(wb, "contacts_export.xlsx");
  };

  const downloadTextFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const escapeCsv = (value: string) => {
    const v = (value ?? '').toString();
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const exportCsv = () => {
    const rows = dedupeResult.rows;
    const header = CARD_FIELDS.join(',');
    const lines = rows.map((c) => CARD_FIELDS.map((f) => escapeCsv(String(c[f] ?? ''))).join(','));
    downloadTextFile('contacts_export.csv', [header, ...lines].join('\n'), 'text/csv;charset=utf-8');
  };

  const escapeVCard = (value: string) =>
    value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');

  const exportVCard = () => {
    const rows = dedupeResult.rows;
    const cards = rows.map((c) => {
      const lines: string[] = [];
      lines.push('BEGIN:VCARD');
      lines.push('VERSION:3.0');
      lines.push(`FN:${escapeVCard((c.name || '').trim())}`);
      if (c.company) lines.push(`ORG:${escapeVCard(c.company.trim())}`);
      if (c.title) lines.push(`TITLE:${escapeVCard(c.title.trim())}`);
      if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(c.email.trim())}`);
      if (c.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(c.phone.trim())}`);
      if (c.website) {
        const url = c.website.trim();
        lines.push(`URL:${escapeVCard(url.includes('://') ? url : `https://${url}`)}`);
      }
      if (c.address) {
        // Store the whole address in the street field if we can't parse it.
        lines.push(`ADR;TYPE=WORK:;;${escapeVCard(c.address.trim())};;;;`);
      }
      lines.push('END:VCARD');
      return lines.join('\n');
    });

    downloadTextFile('contacts_export.vcf', cards.join('\n'), 'text/vcard;charset=utf-8');
  };

  const handleEditChange = (id: string, field: keyof BusinessCard, value: string) => {
    setData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Results</h2>
          <p className="text-slate-500">
            Successfully processed: {validFrames.length}. {failedFrames.length > 0 ? `Failed: ${failedFrames.length}. ` : ''}Verify data before export.
            {dedupeEnabled && dedupeResult.removed > 0 ? ` Duplicates removed on export/table: ${dedupeResult.removed}.` : ''}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <label className="flex items-center text-sm text-slate-600 select-none">
            <input
              type="checkbox"
              className="mr-2"
              checked={dedupeEnabled}
              onChange={(e) => setDedupeEnabled(e.target.checked)}
            />
            Deduplicate
          </label>
          <button
            onClick={onRetry}
            className="flex items-center px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Start Over
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            title="Download CSV"
          >
            <FileText className="w-4 h-4 mr-2" />
            CSV
          </button>
          <button
            onClick={exportVCard}
            className="flex items-center px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            title="Download vCard (.vcf)"
          >
            <IdCard className="w-4 h-4 mr-2" />
            vCard
          </button>
          <button
            onClick={handleExport}
            className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Excel
          </button>
        </div>
      </div>
      {failedMessages.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900 mb-2">Why items failed</div>
          <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
            {failedMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
          {hasMissingKeyError && (
            <button
              onClick={onOpenSettings}
              className="mt-3 inline-flex items-center px-3 py-2 rounded-lg border border-amber-400 text-amber-900 hover:bg-amber-100 text-sm font-medium"
            >
              Open Settings
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-xl shadow border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Website</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Address</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {dedupeResult.rows.map((card) => (
              <tr key={card.id} className="hover:bg-slate-50">
                {(['name', 'company', 'title', 'email', 'phone', 'website', 'address'] as Array<keyof BusinessCard>).map((field) => (
                  <td key={field} className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {editingId === card.id ? (
                      <input
                        type="text"
                        value={card[field as keyof BusinessCard]}
                        onChange={(e) => handleEditChange(card.id, field as keyof BusinessCard, e.target.value)}
                        className={`w-full border rounded px-2 py-1 focus:ring-2 outline-none ${
                          field === 'email' && !isValidEmail(String(card[field] || ''))
                            ? 'border-red-300 focus:ring-red-500'
                            : field === 'phone' && !isValidPhone(String(card[field] || ''))
                              ? 'border-red-300 focus:ring-red-500'
                              : field === 'website' && !isValidUrl(String(card[field] || ''))
                                ? 'border-red-300 focus:ring-red-500'
                                : 'border-blue-300 focus:ring-blue-500'
                        }`}
                      />
                    ) : (
                      <span
                        className={`block max-w-[220px] truncate ${
                          field === 'email' && !isValidEmail(String(card[field] || ''))
                            ? 'text-red-600'
                            : field === 'phone' && !isValidPhone(String(card[field] || ''))
                              ? 'text-red-600'
                              : field === 'website' && !isValidUrl(String(card[field] || ''))
                                ? 'text-red-600'
                                : ''
                        }`}
                        title={String(card[field as keyof BusinessCard] || '')}
                      >
                        {String(card[field as keyof BusinessCard] || '')}
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => setEditingId(editingId === card.id ? null : card.id)}
                    className={`p-2 rounded-full transition-colors ${
                      editingId === card.id ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500 hover:text-blue-600'
                    }`}
                  >
                    {editingId === card.id ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
