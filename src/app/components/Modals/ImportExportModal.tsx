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
  const [unmappedWarning, setUnmappedWarning] = useState<string[] | null>(null);

  const handleClose = () => {
    setUnmappedWarning(null);
    onClose();
  };

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
      const { json, unmappedNames } = exportToCityLookup(state, zipToCityLookup);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
      downloadFile(json, `location-lookup_${date}_${time}.json`, 'application/json');
      addToast('Exported Location Lookup JSON', 'success');
      if (unmappedNames.length > 0) {
        // Keep the modal open with a persistent warning so these names can't be missed.
        setUnmappedWarning(unmappedNames);
      } else {
        onClose();
      }
    } catch {
      addToast('City lookup data not available. Ensure prebuild has run.', 'error');
    } finally {
      setIsLoadingCityLookup(false);
    }
  };

  const handleCopyUnmapped = async () => {
    if (!unmappedWarning) return;
    try {
      await navigator.clipboard.writeText(unmappedWarning.join('\n'));
      addToast('Copied unmapped names to clipboard', 'success');
    } catch {
      addToast('Copy failed', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export Territory Data</h2>
          <button className="modal-close" onClick={handleClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          {unmappedWarning ? (
            <div>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  border: '1px solid #f59e0b',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '0.375rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                  Export complete — {unmappedWarning.length} territor{unmappedWarning.length === 1 ? 'y needs' : 'ies need'} a WordPress ID
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  These were exported with placeholder <code>&quot;unknown:&lt;name&gt;&quot;</code> IDs and are listed under <code>_unmapped</code> in the JSON file. Ask the developer for the WordPress ID for each, then add it to <code>src/lib/location-ids.json</code> and re-export.
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                  {unmappedWarning.map(name => (
                    <li key={name} style={{ fontFamily: 'monospace' }}>{name}</li>
                  ))}
                </ul>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn-sm btn-sm-ghost" onClick={handleCopyUnmapped}>
                  Copy list
                </button>
                <button className="btn-sm btn-sm-primary" onClick={handleClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
