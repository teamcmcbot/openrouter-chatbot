import { NextResponse } from 'next/server';

// Deprecated endpoint: replaced by /api/chat/anonymous and /api/chat/anonymous/error
// Keeping a small stub to avoid build errors while signaling deprecation.

export async function POST() {
	return NextResponse.json(
		{
			error: 'Deprecated endpoint. Use /api/chat/anonymous for usage and /api/chat/anonymous/error for errors.',
		},
		{ status: 410 }
	);
}

export async function GET() {
	return NextResponse.json(
		{
			error: 'Deprecated endpoint. Use /api/chat/anonymous for usage and /api/chat/anonymous/error for errors.',
		},
		{ status: 410 }
	);
}

