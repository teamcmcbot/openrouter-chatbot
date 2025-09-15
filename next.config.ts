import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "spnienrqanrmgzhkkidu.supabase.co",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/**",
      }
    ],
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
