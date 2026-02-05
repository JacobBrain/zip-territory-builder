'use client';

import { useRef } from 'react';
import { useTerritory } from '@/lib/territoryState';
import { exportToJSON, exportToCSV, importFromJSON, downloadFile, getExportFilename } from '@/lib/exportImport';
import { useToast } from '@/app/components/UI/Toast';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const { dispatch } = useTerritory();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = importFromJSON(content);

      if (result.success && result.state) {
        if (confirm('This will replace all current data. Continue?')) {
          dispatch({ type: 'IMPORT_STATE', payload: result.state as any });
          addToast('Territory data imported successfully', 'success');
          onClose();
        }
      } else {
        addToast(result.error || 'Import failed', 'error');
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Territory Data</h2>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Select a previously exported JSON file to restore your territory configuration.
            This will replace all current data.
          </p>
          <button
            className="btn-sm btn-sm-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose JSON File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      </div>
    </div>
  );
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { state } = useTerritory();
  const { addToast } = useToast();

  const handleExportJSON = () => {
    const json = exportToJSON(state);
    downloadFile(json, getExportFilename('json'), 'application/json');
    addToast('Exported as JSON', 'success');
    onClose();
  };

  const handleExportCSV = () => {
    const csv = exportToCSV(state);
    downloadFile(csv, getExportFilename('csv'), 'text/csv');
    addToast('Exported as CSV', 'success');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export Territory Data</h2>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Choose an export format:
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn-sm btn-sm-primary"
              onClick={handleExportJSON}
              style={{ flex: 1, padding: '0.75rem' }}
            >
              <div style={{ fontWeight: 700 }}>JSON</div>
              <div style={{ fontSize: '0.6875rem', opacity: 0.8, marginTop: '0.125rem' }}>
                Full data (re-importable)
              </div>
            </button>
            <button
              className="btn-sm btn-sm-ghost"
              onClick={handleExportCSV}
              style={{ flex: 1, padding: '0.75rem' }}
            >
              <div style={{ fontWeight: 700 }}>CSV</div>
              <div style={{ fontSize: '0.6875rem', opacity: 0.8, marginTop: '0.125rem' }}>
                For Excel / CRM import
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
