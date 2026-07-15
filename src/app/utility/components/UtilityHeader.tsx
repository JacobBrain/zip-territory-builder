'use client';

import AppHeader from '@/app/components/AppHeader';
import { useUtilityMap } from '@/lib/utilityState';

export default function UtilityHeader() {
  const { dispatch } = useUtilityMap();

  return (
    <AppHeader title="MEG Utility Territory Map">
      <button
        className="header-btn"
        onClick={() => dispatch({ type: 'SET_SHOW_HELP', payload: true })}
      >
        Help &amp; data sources
      </button>
    </AppHeader>
  );
}
