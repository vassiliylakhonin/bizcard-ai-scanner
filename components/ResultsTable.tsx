import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Edit2, Check, RefreshCw } from 'lucide-react';
import { BusinessCard, ProcessedFrame } from '../types';

interface ResultsTableProps {
  frames: ProcessedFrame[];
  onRetry: () => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ frames, onRetry }) => {
  // Only show frames that were selected and processed successfully (or have data)
  const validFrames = frames.filter(f => f.isSelected && f.status === 'completed' && f.data);
  const [data, setData] = useState<BusinessCard[]>(validFrames.map(f => f.data!));
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Business Cards");
    XLSX.writeFile(wb, "contacts_export.xlsx");
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
            Successfully processed: {validFrames.length}. Verify data before export.
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={onRetry}
            className="flex items-center px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Start Over
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

      <div className="overflow-x-auto bg-white rounded-xl shadow border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {data.map((card) => (
              <tr key={card.id} className="hover:bg-slate-50">
                {['name', 'company', 'title', 'phone', 'email'].map((field) => (
                  <td key={field} className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {editingId === card.id ? (
                      <input
                        type="text"
                        value={card[field as keyof BusinessCard]}
                        onChange={(e) => handleEditChange(card.id, field as keyof BusinessCard, e.target.value)}
                        className="w-full border border-blue-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      <span className="block max-w-[200px] truncate" title={card[field as keyof BusinessCard]}>
                        {card[field as keyof BusinessCard]}
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