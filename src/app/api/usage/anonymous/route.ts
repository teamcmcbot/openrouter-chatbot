import { NextResponse } from 'next/server';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

// Deprecated endpoint: replaced by /api/chat/anonymous and /api/chat/anonymous/error
// Keeping a small stub to avoid build errors while signaling deprecation.

export async function POST(request: Request) {
	const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
	return NextResponse.json(
		{
			error: 'Deprecated endpoint. Use /api/chat/anonymous for usage and /api/chat/anonymous/error for errors.',
		},
		{ status: 410, headers: { 'x-request-id': requestId } }
	);
}

export async function GET(request: Request) {
	const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
	return NextResponse.json(
		{
			error: 'Deprecated endpoint. Use /api/chat/anonymous for usage and /api/chat/anonymous/error for errors.',
		},
		{ status: 410, headers: { 'x-request-id': requestId } }
	);
}

