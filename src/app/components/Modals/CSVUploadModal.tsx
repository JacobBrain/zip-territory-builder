'use client';

import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTerritory } from '@/lib/territoryState';
import { parseCSV, generateTemplateCSV } from '@/lib/csvParser';
import { geocodeAddresses } from '@/lib/geocoding';
import { getNextColor } from '@/lib/colors';
import type { Location } from '@/types';

interface CSVUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Stage = 'upload' | 'geocoding' | 'done';

interface GeocodingStatus {
  name: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

export default function CSVUploadModal({ isOpen, onClose }: CSVUploadModalProps) {
  const { state, dispatch } = useTerritory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [geocodingStatuses, setGeocodingStatuses] = useState<GeocodingStatus[]>([]);
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  const resetState = () => {
    setStage('upload');
    setIsDragging(false);
    setParseErrors([]);
    setProgress({ current: 0, total: 0 });
    setGeocodingStatuses([]);
    setResults({ success: 0, failed: 0 });
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = useCallback(async (file: File) => {
    const parsed = await parseCSV(file);

    if (!parsed.success || parsed.data.length === 0) {
      setParseErrors(parsed.errors.length > 0 ? parsed.errors : ['No valid rows found in CSV']);
      return;
    }

    if (parsed.errors.length > 0) {
      setParseErrors(parsed.errors);
    }

    // Start geocoding stage
    setStage('geocoding');
    const statuses: GeocodingStatus[] = parsed.data.map(row => ({
      name: row.name,
      status: 'pending' as const,
    }));
    setGeocodingStatuses(statuses);
    setProgress({ current: 0, total: parsed.data.length });

    const addressesToGeocode = parsed.data
      .filter(row => !row.lat || !row.lng)
      .map(row => ({ name: row.name, address: row.address }));

    // Handle rows that already have lat/lng
    const preGeocoded = parsed.data.filter(row => row.lat && row.lng);

    const usedColors = state.locations.map(l => l.color);
    const newLocations: Location[] = [];
    let colorIndex = usedColors.length;

    // Add pre-geocoded locations
    for (const row of preGeocoded) {
      const allUsedColors = [...usedColors, ...newLocations.map(l => l.color)];
      newLocations.push({
        id: uuidv4(),
        name: row.name,
        address: row.address,
        formattedAddress: row.address,
        lat: parseFloat(row.lat!),
        lng: parseFloat(row.lng!),
        color: row.color || getNextColor(allUsedColors),
        zipCodes: [],
        createdAt: new Date().toISOString(),
      });

      const idx = statuses.findIndex(s => s.name === row.name && s.status === 'pending');
      if (idx !== -1) {
        statuses[idx].status = 'success';
        setGeocodingStatuses([...statuses]);
      }
    }

    // Geocode remaining
    if (addressesToGeocode.length > 0) {
      const geocodeResults = await geocodeAddresses(
        addressesToGeocode,
        (current, total, name) => {
          setProgress({ current, total: parsed.data.length });
          const idx = statuses.findIndex(s => s.name === name && s.status === 'pending');
          if (idx !== -1) {
            statuses[idx].status = 'pending'; // Still pending until we get result
            setGeocodingStatuses([...statuses]);
          }
        }
      );

      let successCount = preGeocoded.length;
      let failCount = 0;

      for (const result of geocodeResults) {
        const idx = statuses.findIndex(s => s.name === result.name);
        if (result.result.success && result.result.lat && result.result.lng) {
          const allUsedColors = [...usedColors, ...newLocations.map(l => l.color)];
          const originalRow = parsed.data.find(r => r.name === result.name);
          newLocations.push({
            id: uuidv4(),
            name: result.name,
            address: result.address,
            formattedAddress: result.result.formattedAddress || result.address,
            lat: result.result.lat,
            lng: result.result.lng,
            color: originalRow?.color || getNextColor(allUsedColors),
            zipCodes: [],
            createdAt: new Date().toISOString(),
          });
          successCount++;
          if (idx !== -1) statuses[idx].status = 'success';
        } else {
          failCount++;
          if (idx !== -1) {
            statuses[idx].status = 'error';
            statuses[idx].error = result.result.error;
          }
        }
        setGeocodingStatuses([...statuses]);
      }

      setResults({ success: successCount, failed: failCount });
    } else {
      setResults({ success: preGeocoded.length, failed: 0 });
    }

    // Add all successful locations
    if (newLocations.length > 0) {
      dispatch({ type: 'ADD_LOCATIONS', payload: newLocations });
    }

    setProgress({ current: parsed.data.length, total: parsed.data.length });
    setStage('done');
  }, [state.locations, dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      processFile(file);
    } else {
      setParseErrors(['Please upload a CSV file']);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const downloadTemplate = () => {
    const csv = generateTemplateCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'locations_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {stage === 'upload' && 'Upload Locations CSV'}
            {stage === 'geocoding' && 'Geocoding Locations...'}
            {stage === 'done' && 'Upload Complete'}
          </h2>
          <button className="modal-close" onClick={handleClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          {stage === 'upload' && (
            <>
              <div
                className={`csv-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ fontSize: '2rem', opacity: 0.4 }}>&#x1F4C4;</div>
                <div className="csv-dropzone-text">
                  Drag &amp; drop CSV file here, or click to browse
                </div>
                <div className="csv-dropzone-hint">
                  Required columns: name, address
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
              </div>

              {parseErrors.length > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--aw-claret)' }}>
                  {parseErrors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}

              <button
                onClick={downloadTemplate}
                style={{
                  marginTop: '0.75rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--aw-claret)',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Download template CSV
              </button>
            </>
          )}

          {stage === 'geocoding' && (
            <div className="geocoding-progress">
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                />
              </div>
              <div className="progress-status">
                Geocoding {progress.current} of {progress.total}...
              </div>
              <ul className="progress-list">
                {geocodingStatuses.map((s, i) => (
                  <li key={i} className={`progress-${s.status}`}>
                    {s.status === 'success' && <span>&#x2713;</span>}
                    {s.status === 'error' && <span>&#x2717;</span>}
                    {s.status === 'pending' && <span>&#x23F3;</span>}
                    {s.name}
                    {s.error && <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>({s.error})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stage === 'done' && (
            <div>
              <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                <strong>{results.success}</strong> location{results.success !== 1 ? 's' : ''} added successfully
                {results.failed > 0 && (
                  <span style={{ color: 'var(--aw-claret)' }}>
                    , <strong>{results.failed}</strong> failed
                  </span>
                )}
              </div>
              <ul className="progress-list">
                {geocodingStatuses.map((s, i) => (
                  <li key={i} className={`progress-${s.status}`}>
                    {s.status === 'success' && <span>&#x2713;</span>}
                    {s.status === 'error' && <span>&#x2717;</span>}
                    {s.name}
                    {s.error && <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>({s.error})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {stage === 'done' && (
            <button className="btn-sm btn-sm-primary" onClick={handleClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
