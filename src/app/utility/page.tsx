'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { UtilityProvider } from '@/lib/utilityState';
import { ToastProvider } from '@/app/components/UI/Toast';
import { loadUtilityDataset } from '@/lib/utilityData';
import type { UtilityDataset } from '@/types/utility';
import UtilityHeader from './components/UtilityHeader';
import UtilityFinder from './components/UtilityFinder';
import UtilityInfoCard from './components/UtilityInfoCard';
import LayersToolbar from './components/LayersToolbar';
import UtilityStatusBar from './components/UtilityStatusBar';
import HelpModal from './components/HelpModal';

// Dynamic import for Leaflet (no SSR)
const UtilityMap = dynamic(() => import('./components/UtilityMap'), {
  ssr: false,
  loading: () => (
    <div
      className="map-wrapper"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
    >
      Loading map...
    </div>
  ),
});

export default function UtilityPage() {
  const [dataset, setDataset] = useState<UtilityDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadUtilityDataset()
      .then(setDataset)
      .catch((err) => setLoadError(err.message));
  }, []);

  return (
    <UtilityProvider>
      <ToastProvider>
        <div className="app-layout">
          <UtilityHeader />
          <div className="app-body">
            <UtilityMap dataset={dataset}>
              <div className="map-panel-stack">
                <UtilityFinder dataset={dataset} />
                <UtilityInfoCard dataset={dataset} loadError={loadError} />
              </div>
              <LayersToolbar />
            </UtilityMap>
          </div>
          <UtilityStatusBar dataset={dataset} />
          <HelpModal dataset={dataset} />
        </div>
      </ToastProvider>
    </UtilityProvider>
  );
}
