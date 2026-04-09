'use client';

import { useRef, useState } from 'react';
import { useTerritory } from '@/lib/territoryState';
import { exportToJSON, exportToCSV, exportToCityLookup, loadZipToCityLookup, importFromJSON, downloadFile, getExportFilename } from '@/lib/exportImport';
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
  const [isLoadingCityLookup, setIsLoadingCityLookup] = useState(false);

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

  const handleExportCityLookup = async () => {
    setIsLoadingCityLookup(true);
    try {
      const zipToCityLookup = await loadZipToCityLookup();
      const json = exportToCityLookup(state, zipToCityLookup);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
      downloadFile(json, `location-lookup_${date}_${time}.json`, 'application/json');
      addToast('Exported Location Lookup JSON', 'success');
      onClose();
    } catch {
      addToast('City lookup data not available. Ensure prebuild has run.', 'error');
    } finally {
      setIsLoadingCityLookup(false);
    }
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
            <button
              className="btn-sm btn-sm-ghost"
              onClick={handleExportCityLookup}
              disabled={isLoadingCityLookup}
              style={{ flex: 1, padding: '0.75rem' }}
            >
              <div style={{ fontWeight: 700 }}>
                {isLoadingCityLookup ? 'Loading...' : 'Location Lookup'}
              </div>
              <div style={{ fontSize: '0.6875rem', opacity: 0.8, marginTop: '0.125rem' }}>
                City → location mapping
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
