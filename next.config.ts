import type { NextConfig } from "next";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

const remotePatterns: RemotePattern[] = [];

const addRemotePattern = (pattern: RemotePattern) => {
  const exists = remotePatterns.some(
    (existing) =>
      existing.protocol === pattern.protocol &&
      existing.hostname === pattern.hostname &&
      existing.port === pattern.port &&
      existing.pathname === pattern.pathname,
  );

  if (!exists) {
    remotePatterns.push(pattern);
  }
};

addRemotePattern({
  protocol: "https",
  hostname: "lh3.googleusercontent.com",
});

addRemotePattern({
  protocol: "https",
  hostname: "*.supabase.co",
  pathname: "/storage/v1/object/**",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`Unsupported protocol in NEXT_PUBLIC_SUPABASE_URL: ${parsed.protocol}`);
    }

    const protocol = parsed.protocol.replace(":", "") as "http" | "https";
    const hostname = parsed.hostname;
    const port = parsed.port ? { port: parsed.port } : {};

    if (!hostname.endsWith(".supabase.co")) {
      addRemotePattern({
        protocol,
        hostname,
        pathname: "/storage/v1/object/**",
        ...port,
      });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL provided in next.config.ts: ${supabaseUrl}. ${reason}`,
    );
  }
}

addRemotePattern({
  protocol: "http",
  hostname: "127.0.0.1",
  port: "54321",
  pathname: "/storage/v1/object/**",
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
  // Silence benign webpack warning from OpenTelemetry's dynamic requires pulled in via
  // @prisma/instrumentation (transitively from @sentry/node). The code path is not used
  // in our config (tracing disabled), and this avoids noisy CI output.
  webpack: (config, { isServer }) => {
    const filter = (warning: unknown) => {
      try {
        const w = warning as { message?: string; module?: { resource?: string } };
        const msg: string = w?.message || "";
        const resource: string = w?.module?.resource || "";
        const isCriticalExpr = /Critical dependency: the request of a dependency is an expression/.test(msg);
        const isOtel = /@opentelemetry[\\/].*instrumentation/.test(resource);
        const isPrismaInstr = /@prisma[\\/].*instrumentation/.test(resource);
        return isCriticalExpr && (isOtel || isPrismaInstr);
      } catch {
        return false;
      }
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      filter,
    ];

    // On the server bundle, stub optional tracing/instrumentation modules we don't use.
    if (isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@prisma/instrumentation': false,
        '@opentelemetry/instrumentation': false,
        '@opentelemetry/instrumentation/platform/node': false,
      } as Record<string, false>;
    }
    return config;
  },
};

export default nextConfig;
