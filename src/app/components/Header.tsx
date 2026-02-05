'use client';

import { useState } from 'react';
import CSVUploadModal from './Modals/CSVUploadModal';
import { ImportModal, ExportModal } from './Modals/ImportExportModal';

export default function Header() {
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

  return (
    <>
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-header-title">Zip Territory Builder</span>
        </div>
        <div className="app-header-actions">
          <button
            className="header-btn header-btn-primary"
            onClick={() => setShowCSVUpload(true)}
          >
            Upload CSV
          </button>
          <button
            className="header-btn"
            onClick={() => setShowImport(true)}
          >
            Import
          </button>
          <button
            className="header-btn"
            onClick={() => setShowExport(true)}
          >
            Export
          </button>
        </div>
      </header>

      <CSVUploadModal isOpen={showCSVUpload} onClose={() => setShowCSVUpload(false)} />
      <ImportModal isOpen={showImport} onClose={() => setShowImport(false)} />
      <ExportModal isOpen={showExport} onClose={() => setShowExport(false)} />
    </>
  );
}
