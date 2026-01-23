import { NextRequest, NextResponse } from 'next/server';
import { redis, RedisClient } from '@/lib/redis';

const CACHE_PREFIX = 'results:';
const CACHE_TTL = 60 * 60 * 24; // 24 hours

interface CachedResults {
  repoUrl: string;
  repoId: string;
  repoInfo: {
    name: string;
    description: string;
    stars: number;
    owner: string;
  };
  output: {
    technicalExplanation: string;
    resumeBullets: string[];
    interviewPitch: string;
  };
  cachedAt: number;
}

async function ensureRedisConnected(): Promise<void> {
  try {
    await RedisClient.connect();
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage !== 'Redis is already connecting/connected') {
      throw error;
    }
  }
}

// GET - Retrieve cached results
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = searchParams.get('repoUrl');

    // If no repoUrl specified, get the most recent cached result
    await ensureRedisConnected();

    if (repoUrl) {
      const key = `${CACHE_PREFIX}${encodeURIComponent(repoUrl)}`;
      const data = await redis.get(key);

      if (data) {
        return NextResponse.json({
          success: true,
          cached: JSON.parse(data) as CachedResults,
        });
      }
    }

    // Try to get the "last" cached result
    const lastKey = `${CACHE_PREFIX}last`;
    const lastData = await redis.get(lastKey);

    if (lastData) {
      return NextResponse.json({
        success: true,
        cached: JSON.parse(lastData) as CachedResults,
      });
    }

    return NextResponse.json({
      success: true,
      cached: null,
    });
  } catch (error) {
    console.error('Error retrieving cached results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve cached results' },
      { status: 500 }
    );
  }
}

// POST - Save results to cache
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { repoUrl, repoId, repoInfo, output } = body;

    if (!repoUrl || !output) {
      return NextResponse.json(
        { success: false, error: 'repoUrl and output are required' },
        { status: 400 }
      );
    }

    await ensureRedisConnected();

    const cached: CachedResults = {
      repoUrl,
      repoId: repoId || repoUrl,
      repoInfo,
      output,
      cachedAt: Date.now(),
    };

    const value = JSON.stringify(cached);
    const key = `${CACHE_PREFIX}${encodeURIComponent(repoUrl)}`;

    // Save with specific key
    await redis.setex(key, CACHE_TTL, value);

    // Also save as "last" for easy retrieval
    await redis.setex(`${CACHE_PREFIX}last`, CACHE_TTL, value);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error caching results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cache results' },
      { status: 500 }
    );
  }
}

// DELETE - Clear cached results
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = searchParams.get('repoUrl');

    await ensureRedisConnected();

    if (repoUrl) {
      const key = `${CACHE_PREFIX}${encodeURIComponent(repoUrl)}`;
      await redis.del(key);
    }

    // Also clear the "last" cache
    await redis.del(`${CACHE_PREFIX}last`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing cached results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear cached results' },
      { status: 500 }
    );
  }
}
