"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trackCtaClick } from "../../../lib/analytics/track";
import {
  TIER_FEATURES,
  TIER_LABELS,
  TIER_LIMITS,
  TIER_PRICING_MONTHLY,
} from "../../../lib/constants/tiers";
import { useAuth } from "../../../stores/useAuthStore";
import HeroCarousel from "../../../components/ui/HeroCarousel";

type PlanTier = "free" | "pro" | "enterprise";

type PlanFeature = {
  id: string;
  content: ReactNode;
};

type Plan = {
  tier: PlanTier;
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
    description:
      "Everything you need to explore OpenRouter models and keep conversations in sync.",
    features: [
      {
        id: "catalog",
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
    description: "Unlock faster responses and pro models when you need more horsepower.",
    features: [
      {
        id: "catalog",
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
      {
        id: "history",
        content: "Unlimited saved chats with quick export",
      },
      ...(TIER_FEATURES.pro.webSearch
        ? [
            {
              id: "web-search",
              content: "Web search with inline citations",
            } satisfies PlanFeature,
          ]
        : []),
      ...(TIER_FEATURES.pro.imageAttachments
        ? [
            {
              id: "image-attachments",
              content: "Attach images on supported models",
            } satisfies PlanFeature,
          ]
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
    description: "Reasoning, image generation, and dedicated support for heavy usage.",
    features: [
      {
        id: "catalog",
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
      {
        id: "support",
        content: "Priority support with a dedicated contact",
      },
      ...(TIER_FEATURES.enterprise.reasoning
        ? [
            {
              id: "reasoning",
              content: "Reasoning mode for complex problem solving",
            } satisfies PlanFeature,
          ]
        : []),
      ...(TIER_FEATURES.enterprise.imageGeneration
        ? [
            {
              id: "image-generation",
              content: "Image generation on selected models",
            } satisfies PlanFeature,
          ]
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
];

const faqItems = [
  {
    id: "no-coding",
    question: "Do I need to code to use GreenBubble?",
    answer:
      "Not at all. Just sign in, choose a model, and start chatting like you would with any messaging app. You can customize the AI's personality in settings if you want, but there's zero coding required.",
  },
  {
    id: "switching",
    question: "Can I switch models on the fly?",
    answer:
      "Yes. Every conversation lets you swap between OpenRouter providers like Anthropic Claude, OpenAI GPT-4o, Google Gemini, and more without losing context.",
  },
  {
    id: "history",
    question: "What happens to my chat history?",
    answer:
      "Your conversations are saved automatically and stay available in GreenBubble. You can return to any chat anytime to continue the conversation or review past responses.",
  },
  {
    id: "billing",
    question: "How does billing work?",
    answer:
      "Upgrade only when you need more usage. The free tier stays free, Pro unlocks premium models, and Enterprise opens the full catalog with concierge help.",
  },
];

const featureHighlights = [
  {
    id: "models",
    title: "Choose your model",
    description: (
      <>
        No need to download separate apps for ChatGPT, Claude, or Gemini. Access{" "}
        <Link
          href="/models"
          className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
        >
          100+ models
        </Link>{" "}
        from different providers right here.
      </>
    ),
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    accentClass:
      "bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-blue-900 dark:text-yellow-400 dark:ring-0",
  },
  {
    id: "costs",
    title: "Stay in control of costs",
    description:
      "Preview which models fit your budget before you commit, instead of being tied to one provider.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    accentClass:
      "bg-green-50 text-green-600 ring-1 ring-green-100 dark:bg-green-900 dark:text-green-400 dark:ring-0",
  },
  {
    id: "tone",
    title: "Set the vibe",
    description:
      "Want formal responses? Playful banter? Choose from 8 personalities or craft your own instructions.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
    accentClass:
      "bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-purple-900 dark:text-sky-400 dark:ring-0",
  },
];

const formatPrice = (value: number) => `$${value.toLocaleString()}`;

export default function LandingPageClient() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const handleUpgradeRedirect = (plan: Exclude<PlanTier, "free">) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (isAuthenticated) return;
      event.preventDefault();
      const subscriptionPath = `/account/subscription?src=upgrade&plan=${plan}`;
      router.push(`/auth/signin?returnTo=${encodeURIComponent(subscriptionPath)}`);
    };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col items-center min-h-full">
        <section className="w-full">
          <div className="relative isolate px-4 py-2 w-full">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-8 sm:gap-12 lg:gap-16 xl:gap-12 items-center">
                {/* Left column: Text content */}
                <div className="text-center xl:text-left xl:px-8">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs sm:text-sm font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    Powered by OpenRouter
                  </span>
                  <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-slate-900 dark:text-white leading-tight">
                    Multi-model AI chat
                    <span className="text-emerald-700 dark:text-emerald-400 block">No lock-in. Just more choices.</span>
                  </h1>

                  {/* Mobile/Tablet carousel - visible below xl, positioned between h1 and paragraph */}
                  <div className="xl:hidden mt-4 sm:mt-6 flex justify-center">
                    <div className="w-full max-w-[200px] sm:max-w-xs lg:max-w-sm">
                      <HeroCarousel
                        images={[
                          {
                            src: "/hero-mobile-portrait-1.png",
                            alt: "GreenBubble mobile chat interface",
                          },
                          {
                            src: "/hero-mobile-portrait-2.png",
                            alt: "GreenBubble desktop chat interface",
                          },
                        ]}
                        interval={5000}
                      />
                    </div>
                  </div>

                  <p className="mt-4 sm:mt-6 xl:mt-4 xl:sm:mt-6 text-lg sm:text-xl lg:text-xl xl:text-2xl text-slate-600 dark:text-gray-300">
                    GreenBubble lets you jump between Anthropic, OpenAI, Google, Mistral, and dozens of other OpenRouter models
                    without swapping apps. Pick what works, compare outputs, and keep chatting.
                  </p>
                  <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center xl:justify-start items-center">
                    <Link
                      href="/chat"
                      onClick={() => trackCtaClick({ page: "landing", cta_id: "start_chat", location: "hero" })}
                      className="inline-flex items-center justify-center px-5 sm:px-6 lg:px-8 py-3 sm:py-3.5 lg:py-4 text-base sm:text-lg font-medium text-white bg-emerald-700 hover:bg-emerald-600 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-200 shadow-sm hover:shadow-md whitespace-nowrap"
                    >
                      Start chatting for free
                      <svg className="ml-2 w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        trackCtaClick({ page: "landing", cta_id: "learn_more", location: "hero" });
                        document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="inline-flex items-center justify-center px-5 sm:px-6 lg:px-8 py-3 sm:py-3.5 lg:py-4 text-base sm:text-lg font-medium text-slate-700 bg-white ring-1 ring-slate-200 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors duration-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700 whitespace-nowrap"
                    >
                      See what&apos;s inside
                    </button>
                  </div>
                </div>

                {/* Right column: Hero carousel - hidden on mobile/tablet, shows on xl devices */}
                <div className="hidden xl:flex xl:justify-center xl:items-start">
                  <div className="w-full max-w-sm max-h-[80vh]">
                    <HeroCarousel
                      images={[
                        {
                          src: "/hero-mobile-portrait-1.png",
                          alt: "GreenBubble mobile chat interface",
                        },
                        {
                          src: "/hero-mobile-portrait-2.png",
                          alt: "GreenBubble mobile chat interface",
                        },
                        {
                          src: "/hero-mobile-portrait-3.png",
                          alt: "GreenBubble mobile chat interface",
                        }
                      ]}
                      interval={5000}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mt-16 w-full px-4">
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
            {featureHighlights.map((feature) => (
              <div
                key={feature.id}
                className="text-center p-6 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
              >
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 ${feature.accentClass}`}
                >
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 dark:text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mt-20 mb-12 w-full px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4 text-center">
            Pick a plan that fits your usage
          </h2>
          <p className="text-lg text-slate-600 dark:text-gray-300 mb-12 text-center max-w-3xl mx-auto">
            Every option keeps your conversations in GreenBubble and lets you choose from OpenRouter models. Upgrade only
            when you need more requests or premium providers.
          </p>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => {
              const { requestsPerHour, tokensPerRequest } = plan.limits;
              const priceLabel = formatPrice(plan.price);

              return (
                <div
                  key={plan.tier}
                  className={`relative bg-white dark:bg-gray-800 p-6 rounded-xl border shadow-sm transition-shadow hover:shadow-md ${
                    plan.recommended
                      ? "border-emerald-300 dark:border-emerald-500 ring-1 ring-emerald-200/70"
                      : "border-slate-200 dark:border-gray-700"
                  }`}
                >
                  {plan.recommended ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">{plan.title}</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{plan.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-slate-900 dark:text-white">
                        {priceLabel}
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
                        <li
                          key={feature.id}
                          className="flex items-start gap-3 text-sm text-slate-700 dark:text-gray-300"
                        >
                          <span className="mt-1 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                          <span>{feature.content}</span>
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
                          handleUpgradeRedirect(plan.tier)(event);
                        }
                      }}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                        plan.tier === "pro" || plan.tier === "enterprise"
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
        </section>

        <section className="mt-20 w-full px-4">
          <div className="max-w-6xl mx-auto rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm dark:border-emerald-500/20 dark:bg-gray-800 lg:p-10">
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">Why people choose GreenBubble</h3>
            <p className="mt-4 text-base text-slate-500 dark:text-gray-400 md:text-lg">
              GreenBubble keeps discovery simple—compare models, hold onto helpful threads, and understand exactly what each plan includes.
            </p>
            <div className="mt-6 grid gap-y-8 gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
              <div className="text-sm text-slate-600 dark:text-gray-300">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Compare models quickly</p>
                <p className="mt-2 leading-relaxed">Run the same prompt across different providers and spot the answer you want faster.</p>
              </div>
              <div className="text-sm text-slate-600 dark:text-gray-300">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Chats stay with you</p>
                <p className="mt-2 leading-relaxed">Every conversation lives in GreenBubble so you can revisit takeaways whenever inspiration strikes.</p>
              </div>
              <div className="text-sm text-slate-600 dark:text-gray-300">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Works on every device</p>
                <p className="mt-2 leading-relaxed">Open GreenBubble on laptop or mobile and pick up your conversations right where you left them.</p>
              </div>
              <div className="text-sm text-slate-600 dark:text-gray-300">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Transparent pricing</p>
                <p className="mt-2 leading-relaxed">Usage limits are clear up front, so you only upgrade when you need more requests or premium models.</p>
              </div>
              <div className="text-sm text-slate-600 dark:text-gray-300">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Swap models mid-chat</p>
                <p className="mt-2 leading-relaxed">Jump between Anthropic, OpenAI, Google, and more in the same conversation without losing context.</p>
              </div>
              <div className="text-sm text-slate-600 dark:text-gray-300">
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Preset personalities for every need</p>
                <p className="mt-2 leading-relaxed">From Technical Expert to Creative Collaborator, Empathetic Listener to Concise Advisor—pick from 8 styles or create your own.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="mt-20 w-full px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
              Frequently asked questions
            </h2>
            <p className="mt-3 text-lg text-slate-600 dark:text-gray-300">
              Still exploring ChatGPT alternatives? These answers highlight how GreenBubble helps teams evaluate models and
              scale responsibly.
            </p>
          </div>
          <div className="mt-10 grid gap-6 max-w-4xl mx-auto">
            {faqItems.map((faq) => (
              <div
                key={faq.id}
                className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{faq.question}</h3>
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                </div>
                <p className="mt-3 text-slate-600 dark:text-gray-300">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 mb-10 w-full px-4">
          <div className="rounded-2xl bg-gradient-to-r from-emerald-50 via-emerald-50/70 to-teal-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-700 ring-1 ring-emerald-100 dark:ring-gray-700 shadow-sm">
            <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
              <div className="flex flex-col md:flex-row items-center md:items-center justify-between gap-6">
                <div className="text-center md:text-left max-w-2xl">
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                    Ready to get started?
                  </h2>
                  <p className="mt-2 text-slate-600 dark:text-gray-300">
                    Join teams who are already shipping faster with a secure, OpenRouter-powered chat workspace.
                  </p>
                </div>
                <Link
                  href="/chat"
                  onClick={() =>
                    trackCtaClick({ page: "landing", cta_id: "try_it_now", location: "footerBanner" })
                  }
                  aria-label="Start chatting now for free"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors duration-200 shadow-sm hover:shadow-md"
                >
                  Try it now — it&apos;s free!
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
