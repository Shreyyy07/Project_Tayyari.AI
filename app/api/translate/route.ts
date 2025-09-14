import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, target_language } = await request.json();
    
    if (!text || !target_language) {
      return NextResponse.json({ error: 'Text and target language required' }, { status: 400 });
    }

    // Clean up text for translation (remove markdown formatting but keep structure)
    const cleanText = text
      .replace(/[#*`_]/g, '') // Remove markdown characters
      .replace(/\n+/g, '\n')   // Keep line breaks but normalize them
      .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
      .trim();

    // Split into chunks if text is too long (MyMemory has limits)
    const chunkSize = 400; // Smaller chunks for better translation
    const chunks = [];
    
    if (cleanText.length <= chunkSize) {
      chunks.push(cleanText);
    } else {
      // Split by sentences to maintain context
      const sentences = cleanText.split(/[.!?]+/);
      let currentChunk = '';
      
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= chunkSize) {
          currentChunk += sentence + '. ';
        } else {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = sentence + '. ';
        }
      }
      if (currentChunk) chunks.push(currentChunk.trim());
    }

    // Translate each chunk
    const translatedChunks = [];
    
    for (const chunk of chunks) {
      const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${target_language}`;
      
      const response = await fetch(translationUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'TayyariAI/1.0',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
          translatedChunks.push(data.responseData.translatedText);
        } else {
          translatedChunks.push(chunk); // Fallback to original if translation fails
        }
      } else {
        translatedChunks.push(chunk); // Fallback to original if API fails
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const fullTranslation = translatedChunks.join(' ');
    
    return NextResponse.json({ 
      translated_text: fullTranslation,
      source_language: 'en',
      target_language: target_language,
      service: 'MyMemory',
      chunks_translated: translatedChunks.length
    });
    
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json({ error: 'Translation service unavailable' }, { status: 500 });
  }
}