"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TIER_FEATURES, TIER_LABELS, TIER_LIMITS, TIER_PRICING_MONTHLY } from "../../../lib/constants/tiers";
import { trackCtaClick } from "../../../lib/analytics/track";
import { useAuth } from "../../../stores/useAuthStore";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  type PlanFeature = {
    id: string;
    content: ReactNode;
  };

  type Plan = {
    tier: "free" | "pro" | "enterprise";
    title: string;
    price: number;
    description: string;
    features: PlanFeature[];
    limits: {
      requestsPerHour: number;
      tokensPerRequest: number;
    };
    cta: {
      label: string;
      href: string;
      id: string;
    };
    recommended?: boolean;
  };

  const plans: Plan[] = [
    {
      tier: "free",
      title: TIER_LABELS.free,
      price: TIER_PRICING_MONTHLY.free,
      description: "Everything you need to explore OpenRouter models and keep your chats in sync.",
      features: [
        {
          id: "free-catalog",
          content: (
            <>
              Access {" "}
              <Link
                href="/models?tier=free"
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
              >
                Base model
              </Link>{" "}
              catalog
            </>
          ),
        },
        {
          id: "history",
          content: "Save and revisit every conversation",
        },
        {
          id: "prompts",
          content: "Custom system prompts on each chat",
        },
      ],
      limits: {
        requestsPerHour: TIER_LIMITS.free.maxRequestsPerHour,
        tokensPerRequest: TIER_LIMITS.free.maxTokensPerRequest,
      },
      cta: {
        label: "Start for free",
        href: "/chat",
        id: "pricing_free",
      },
    },
    {
      tier: "pro",
      title: TIER_LABELS.pro,
      price: TIER_PRICING_MONTHLY.pro,
      description: "Unlock research tools and pro-grade models for power users and small teams.",
      features: [
        {
          id: "pro-catalog",
          content: (
            <>
              Access {" "}
              <Link
                href="/models?tier=pro"
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
              >
                Pro model
              </Link>{" "}
              catalog
            </>
          ),
        },
        ...(TIER_FEATURES.pro.webSearch
          ? [{ id: "pro-web", content: "Web search with inline citations" } satisfies PlanFeature]
          : []),
        ...(TIER_FEATURES.pro.imageAttachments
          ? [{ id: "pro-attachments", content: "Attach images on selected models" } satisfies PlanFeature]
          : []),
      ],
      limits: {
        requestsPerHour: TIER_LIMITS.pro.maxRequestsPerHour,
        tokensPerRequest: TIER_LIMITS.pro.maxTokensPerRequest,
      },
      cta: {
        label: "Upgrade to Pro",
        href: "/account/subscription?src=upgrade&plan=pro",
        id: "pricing_pro",
      },
      recommended: true,
    },
    {
      tier: "enterprise",
      title: TIER_LABELS.enterprise,
      price: TIER_PRICING_MONTHLY.enterprise,
      description: "Enterprise adds reasoning, image generation, and near-unlimited usage for demanding teams.",
      features: [
        {
          id: "enterprise-catalog",
          content: (
            <>
              Access {" "}
              <Link
                href="/models?tier=enterprise"
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
              >
                Enterprise model
              </Link>{" "}
              catalog
            </>
          ),
        },
        ...(TIER_FEATURES.enterprise.reasoning
          ? [{ id: "enterprise-reasoning", content: "Reasoning mode for complex problem solving" } satisfies PlanFeature]
          : []),
        ...(TIER_FEATURES.enterprise.imageGeneration
          ? [{ id: "enterprise-image", content: "Image generation on selected models" } satisfies PlanFeature]
          : []),
      ],
      limits: {
        requestsPerHour: TIER_LIMITS.enterprise.maxRequestsPerHour,
        tokensPerRequest: TIER_LIMITS.enterprise.maxTokensPerRequest,
      },
      cta: {
        label: "Upgrade to Enterprise",
        href: "/account/subscription?src=upgrade&plan=enterprise",
        id: "pricing_enterprise",
      },
    },
  ] as const;

  const handleUpgradeClick = (plan: "pro" | "enterprise") => (event: MouseEvent<HTMLAnchorElement>) => {
    if (isAuthenticated) return;
    event.preventDefault();
    const subscriptionPath = `/account/subscription?src=upgrade&plan=${plan}`;
    router.push(`/auth/signin?returnTo=${encodeURIComponent(subscriptionPath)}`);
  };

  return (
    <div className="h-full overflow-y-auto px-4">
      <div className="flex flex-col items-center min-h-full">
      {/* Hero Section */}
      <div className="w-full">
        {/* Subtle brand-tinted hero background in light mode */}
        <div className="relative isolate -mx-4 px-4 pb-2 pt-4 sm:pt-6 md:pt-8 bg-white dark:bg-transparent bg-gradient-to-b from-emerald-50/40 via-white to-white dark:from-transparent dark:via-transparent dark:to-transparent">
        <div className="max-w-4xl mx-auto text-center">
        <div className="mb-4 mt-4">
          <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 dark:text-white mb-6">
            Multi-model AI chat{" "}
            <span className="text-emerald-700 dark:text-emerald-400 block">
              Powered by OpenRouter
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            GreenBubble is a ChatGPT alternative where you can swap between Anthropic, OpenAI, Google, and other OpenRouter models without getting locked into a single provider.
          </p>
        </div>

        {/* Call to Action */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Link
            href="/chat"
            onClick={() => trackCtaClick({ page: "landing", cta_id: "start_chat", location: "hero" })}
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-emerald-700 hover:bg-emerald-600 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
          >
            Start Chatting for Free
            <svg 
              className="ml-2 w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M13 7l5 5m0 0l-5 5m5-5H6" 
              />
            </svg>
          </Link>
          <button 
            onClick={() => { trackCtaClick({ page: "landing", cta_id: "learn_more", location: "hero" }); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }}
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-slate-700 bg-white ring-1 ring-slate-300 rounded-lg hover:bg-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors duration-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Learn More
          </button>
        </div>

        {/* Features Grid */}
        <div id="features" className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center p-6 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-blue-900 dark:text-yellow-400 dark:ring-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Choose your model
            </h3>
            <p className="text-slate-600 dark:text-gray-400">
              Decide which AI (or personality) you want for each chat with just a couple of clicks.
            </p>
          </div>

          <div className="text-center p-6 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 bg-green-50 text-green-600 ring-1 ring-green-100 dark:bg-green-900 dark:text-green-400 dark:ring-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Stay in control of costs
            </h3>
            <p className="text-slate-600 dark:text-gray-400">
              Preview which models fit your budget before you commit, instead of being tied to one provider.
            </p>
          </div>

          <div className="text-center p-6 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-purple-900 dark:text-sky-400 dark:ring-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Set the vibe
            </h3>
            <p className="text-slate-600 dark:text-gray-400">
              Tell GreenBubble how to respond: formal, playful, or expert—and it keeps that tone for the session.
            </p>
          </div>
        </div>
        </div>
      </div>
        {/* Pricing Section */}
        <div id="pricing" className="mt-16 mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4 text-center">
            Choose the plan that fits your team
          </h2>
          <p className="text-lg text-slate-600 dark:text-gray-300 mb-12 text-center max-w-3xl mx-auto">
            Every tier includes secure chat history, customizable instructions, and OpenRouter model switching. Upgrade when you need higher limits or advanced capabilities.
          </p>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => {
              const { requestsPerHour, tokensPerRequest } = plan.limits;
              return (
                <div
                  key={plan.tier}
                  className={`relative bg-white dark:bg-gray-800 p-6 rounded-xl border shadow-sm transition-shadow hover:shadow-md ${
                    plan.recommended
                      ? "border-emerald-300 dark:border-emerald-500 ring-1 ring-emerald-200/70"
                      : "border-slate-200 dark:border-gray-700"
                  }`}
                >
                  {plan.recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">{plan.title}</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{plan.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-slate-900 dark:text-white">
                        ${plan.price}
                        <span className="text-sm font-medium text-slate-500 dark:text-gray-400">/mo</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-slate-200 dark:border-gray-700 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-3">
                      What&apos;s included
                    </p>
                    <ul className="space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature.id} className="flex items-start gap-3 text-sm text-slate-700 dark:text-gray-300">
                          <span className="mt-1 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                          <span className="text-slate-700 dark:text-gray-300">{feature.content}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 border-t border-slate-200 dark:border-gray-700 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-3">
                      Usage limits
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between text-slate-700 dark:text-gray-300">
                        <span>Requests per hour</span>
                        <span className="font-medium">{requestsPerHour.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-700 dark:text-gray-300">
                        <span>Tokens per request</span>
                        <span className="font-medium">{tokensPerRequest.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Link
                      href={plan.cta.href}
                      onClick={(event) => {
                        trackCtaClick({ page: "landing", cta_id: plan.cta.id, location: "pricing" });
                        if (plan.tier === "pro" || plan.tier === "enterprise") {
                          handleUpgradeClick(plan.tier)(event);
                        }
                      }}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                        plan.recommended
                          ? "bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-400"
                          : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-400 dark:bg-gray-700 dark:hover:bg-gray-600"
                      } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                    >
                      {plan.cta.label}
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Additional CTA */}
        <div className="mt-16 rounded-2xl bg-gradient-to-r from-emerald-50 via-emerald-50/70 to-teal-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-700 ring-1 ring-emerald-100 dark:ring-gray-700 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
            <div className="flex flex-col md:flex-row items-center md:items-center justify-between gap-6">
              <div className="text-center md:text-left max-w-2xl">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                  Ready to get started?
                </h2>
                <p className="mt-2 text-slate-600 dark:text-gray-300">
                  Join thousands of users who are already experiencing the future of AI conversation.
                </p>
              </div>
              <Link
                href="/chat"
                onClick={() => trackCtaClick({ page: "landing", cta_id: "try_it_now", location: "footerBanner" })}
                aria-label="Start chatting now for free"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors duration-200 shadow-sm hover:shadow-md"
              >
                Try it now - it&apos;s free!
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
