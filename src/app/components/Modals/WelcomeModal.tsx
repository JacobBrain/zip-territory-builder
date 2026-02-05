'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ztb-welcome-dismissed';

export default function WelcomeModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Welcome to Zip Territory Builder</h2>
          <button className="modal-close" onClick={dismiss}>&times;</button>
        </div>
        <div className="modal-body">
          <ol className="welcome-steps">
            <li>
              <strong>Add locations</strong>
              <span>Upload a CSV or add manually in the sidebar</span>
            </li>
            <li>
              <strong>Select a location</strong>
              <span>Click a location in the sidebar to make it active</span>
            </li>
            <li>
              <strong>Assign zip codes</strong>
              <span>Click individual zips on the map, or <kbd>Shift</kbd>+drag to paint</span>
            </li>
            <li>
              <strong>Radius auto-assign</strong>
              <span>Hover a location, click the <strong>&#x25CE;</strong> icon, set a mile radius</span>
            </li>
            <li>
              <strong>Eraser</strong>
              <span>Press <kbd>E</kbd> to toggle eraser mode, then click or paint to remove</span>
            </li>
            <li>
              <strong>Fit view</strong>
              <span>Press <kbd>F</kbd> to zoom to all locations</span>
            </li>
            <li>
              <strong>Export</strong>
              <span>Use the Export button in the header to save your work</span>
            </li>
          </ol>
        </div>
        <div className="modal-footer">
          <button className="btn-sm btn-sm-primary" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
