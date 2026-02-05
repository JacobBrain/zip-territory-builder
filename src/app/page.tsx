'use client';

import dynamic from 'next/dynamic';
import { TerritoryProvider } from '@/lib/territoryState';
import { ToastProvider } from '@/app/components/UI/Toast';
import Header from '@/app/components/Header';
import Sidebar from '@/app/components/Sidebar/Sidebar';
import StatusBar from '@/app/components/StatusBar';

// Dynamic import for Leaflet (no SSR)
const TerritoryMap = dynamic(
  () => import('@/app/components/Map/TerritoryMap'),
  { ssr: false, loading: () => <div className="map-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading map...</div> }
);

export default function Home() {
  return (
    <TerritoryProvider>
      <ToastProvider>
        <div className="app-layout">
          <Header />
          <div className="app-body">
            <Sidebar />
            <TerritoryMap />
          </div>
          <StatusBar />
        </div>
      </ToastProvider>
    </TerritoryProvider>
  );
}
