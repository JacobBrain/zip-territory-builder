import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Google Maps API key not configured' },
        { status: 500 }
      );
    }

    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      return NextResponse.json({
        success: true,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
      });
    }

    if (data.status === 'ZERO_RESULTS') {
      return NextResponse.json({
        success: false,
        error: 'Address not found',
      });
    }

    if (data.status === 'OVER_QUERY_LIMIT') {
      return NextResponse.json(
        { success: false, error: 'Geocoding rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    if (data.status === 'REQUEST_DENIED') {
      return NextResponse.json(
        { success: false, error: 'Geocoding API key error. Check server configuration.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: false,
      error: `Geocoding failed: ${data.status}`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Server error: ${String(error)}` },
      { status: 500 }
    );
  }
}
