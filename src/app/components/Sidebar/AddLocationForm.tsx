'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTerritory } from '@/lib/territoryState';
import { geocodeAddress } from '@/lib/geocoding';
import { getNextColor } from '@/lib/colors';

export default function AddLocationForm() {
  const { state, dispatch } = useTerritory();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;

    setIsLoading(true);
    setError('');

    const result = await geocodeAddress(address.trim());

    if (result.success && result.lat && result.lng) {
      const usedColors = state.locations.map(l => l.color);
      dispatch({
        type: 'ADD_LOCATION',
        payload: {
          id: uuidv4(),
          name: name.trim(),
          address: address.trim(),
          formattedAddress: result.formattedAddress || address.trim(),
          lat: result.lat,
          lng: result.lng,
          color: getNextColor(usedColors),
          zipCodes: [],
          createdAt: new Date().toISOString(),
        },
      });
      setName('');
      setAddress('');
      setIsOpen(false);
    } else {
      setError(result.error || 'Geocoding failed');
    }

    setIsLoading(false);
  };

  if (!isOpen) {
    return (
      <button className="add-location-toggle" onClick={() => setIsOpen(true)}>
        + Add Location
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Location name"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <input
        type="text"
        placeholder="Full address (e.g. 123 Main St, City, ST 12345)"
        value={address}
        onChange={e => setAddress(e.target.value)}
      />
      {error && (
        <div style={{ fontSize: '0.75rem', color: 'var(--aw-claret)' }}>{error}</div>
      )}
      <div className="add-form-actions">
        <button
          type="submit"
          className="btn-sm btn-sm-primary"
          disabled={isLoading || !name.trim() || !address.trim()}
        >
          {isLoading ? 'Geocoding...' : 'Add'}
        </button>
        <button
          type="button"
          className="btn-sm btn-sm-ghost"
          onClick={() => { setIsOpen(false); setError(''); }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
