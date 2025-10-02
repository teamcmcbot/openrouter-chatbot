import { NextResponse } from 'next/server';
import { getModelCatalog } from '../../../../../lib/server/modelCatalog';
import { logger } from '../../../../../lib/utils/logger';

/**
 * GET /api/models/catalog
 * 
 * Returns the full model catalog with client-ready transformed data.
 * This endpoint is used by the /models page to fetch catalog data client-side,
 * avoiding the need to embed 3+ MB of data in the initial HTML.
 * 
 * Benefits:
 * - Reduces initial HTML size from ~3.2 MB to ~50 KB
 * - Improves Lighthouse LCP score (no blocking huge payload)
 * - Still benefits from Phase 2 cache optimization on server
 * - Client can show loading state while fetching
 */
export async function GET() {
  try {
    const catalog = await getModelCatalog();
    
    return NextResponse.json(catalog, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    });
  } catch (error) {
    logger.error('api.models.catalog.error', error);
    return NextResponse.json(
      { error: 'Failed to fetch model catalog' },
      { status: 500 }
    );
  }
}
