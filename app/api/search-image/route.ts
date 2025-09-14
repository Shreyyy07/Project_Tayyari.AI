import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  
  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  const UNSPLASH_ACCESS_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;
  
  if (!UNSPLASH_ACCESS_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      {
        headers: {
          'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch from Unsplash');
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const image = data.results[0];
      return NextResponse.json({
        imageUrl: image.urls.regular,
        description: image.alt_description || image.description || query,
        photographer: image.user.name,
        photographerUrl: image.user.links.html,
      });
    } else {
      return NextResponse.json({ imageUrl: null });
    }
  } catch (error) {
    console.error('Unsplash API error:', error);
    return NextResponse.json({ error: 'Image search failed' }, { status: 500 });
  }
}