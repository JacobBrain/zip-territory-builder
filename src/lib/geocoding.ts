import type { GeocodeResult } from '@/types';

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  try {
    const response = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });

    if (!response.ok) {
      return { success: false, error: `Server error: ${response.status}` };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: `Network error: ${String(error)}` };
  }
}

export async function geocodeAddresses(
  addresses: { name: string; address: string }[],
  onProgress: (current: number, total: number, name: string) => void
): Promise<{ name: string; address: string; result: GeocodeResult }[]> {
  const results: { name: string; address: string; result: GeocodeResult }[] = [];

  for (let i = 0; i < addresses.length; i++) {
    const item = addresses[i];
    onProgress(i + 1, addresses.length, item.name);

    const result = await geocodeAddress(item.address);
    results.push({ name: item.name, address: item.address, result });

    // Rate limit: 100ms delay between requests
    if (i < addresses.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}
