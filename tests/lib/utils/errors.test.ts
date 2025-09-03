import { handleError, ErrorCode, ApiErrorResponse } from '../../../lib/utils/errors';

// Minimal logger mock to avoid noisy output
jest.mock('../../../lib/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('handleError', () => {
  let responseSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock global Response to capture body and init
    const g = global as unknown as { Response: (body?: BodyInit | null, init?: ResponseInit) => Response };
    responseSpy = jest
      .spyOn(g, 'Response')
      .mockImplementation((body?: BodyInit | null, init?: ResponseInit) => {
        // Return a minimal compatible shape used by tests
        const headersMap = new Map(
          Object.entries((init?.headers as Record<string, string>) ?? {})
        );
        // Return object with minimal fields; tests access status, headers, and custom body property via casts
        const mockRes = {
          status: init?.status ?? 200,
          headers: headersMap as unknown as Headers,
          __rawBody: body,
        } as unknown as Response;
        return mockRes;
      });
  });

  afterEach(() => {
    responseSpy.mockRestore();
  });

  it('maps ApiErrorResponse with upstream metadata into JSON body', async () => {
    const upstream = {
      error: {
        code: 429,
        message: 'Too Many Requests',
        metadata: {
          provider_name: 'openrouter',
          provider_request_id: 'prov-123',
        },
      },
    };

    const err = new ApiErrorResponse(
      'Rate limit exceeded',
      ErrorCode.RATE_LIMIT_EXCEEDED,
      JSON.stringify(upstream),
      30,
      ['wait and retry']
    );

  const res = handleError(err, 'req-abc') as unknown as { status: number; headers: Map<string, string>; __rawBody: string };
  expect(res.status).toBe(429);
  expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
  expect(res.headers.get('x-request-id')).toBe('req-abc');

  const body = JSON.parse(res.__rawBody);
    expect(body).toMatchObject({
      error: 'Rate limit exceeded',
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      retryAfter: 30,
      suggestions: ['wait and retry'],
      upstreamErrorCode: 429,
      upstreamErrorMessage: 'Too Many Requests',
      upstreamProvider: 'openrouter',
      upstreamProviderRequestId: 'prov-123',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('handles non-JSON details gracefully', async () => {
    const err = new ApiErrorResponse(
      'Bad gateway',
      ErrorCode.BAD_GATEWAY,
      'upstream failed'
    );

  const res = handleError(err) as unknown as { status: number; headers: Map<string, string>; __rawBody: string };
  expect(res.status).toBe(502);
  const body = JSON.parse(res.__rawBody);
    expect(body).toMatchObject({
      error: 'Bad gateway',
      code: ErrorCode.BAD_GATEWAY,
      details: 'upstream failed',
    });
    expect(body.upstreamErrorCode).toBeUndefined();
    expect(body.upstreamProvider).toBeUndefined();
  });

  it('falls back to INTERNAL_SERVER_ERROR for unknown errors', async () => {
  const res = handleError(new Error('boom')) as unknown as { status: number; headers: Map<string, string>; __rawBody: string };
  expect(res.status).toBe(500);
  const body = JSON.parse(res.__rawBody);
    expect(body.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(body.error).toBe('An internal error occurred.');
  });
});
