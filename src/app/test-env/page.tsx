'use client';

export default function TestEnvPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Environment Variable Test</h1>
      <div>
        <h3>Client-side process.env:</h3>
        <pre>{JSON.stringify({
          NEXT_PUBLIC_ENABLE_ENHANCED_MODELS: process.env.NEXT_PUBLIC_ENABLE_ENHANCED_MODELS,
          NEXT_PUBLIC_ENABLE_CONTEXT_AWARE: process.env.NEXT_PUBLIC_ENABLE_CONTEXT_AWARE,
          allNextPublicVars: Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC'))
        }, null, 2)}</pre>
      </div>
    </div>
  );
}
