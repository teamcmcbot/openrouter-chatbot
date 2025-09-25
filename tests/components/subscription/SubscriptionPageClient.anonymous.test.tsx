import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/navigation hooks inline to avoid resolver recursion
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  })),
  usePathname: jest.fn(() => "/"),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock auth store to simulate anonymous state
jest.mock("../../../stores/useAuthStore", () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

// Mock logger to be quiet
jest.mock("../../../lib/utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

// Mock child components used inside the page to avoid deeper behavior
jest.mock("../../../components/subscription/PlanSelector", () => {
  const Mock = () => <div>PlanSelector</div>;
  Mock.displayName = 'MockPlanSelector';
  return Mock;
});
jest.mock("../../../components/subscription/BillingHistory", () => {
  const Mock = () => <div>BillingHistory</div>;
  Mock.displayName = 'MockBillingHistory';
  return Mock;
});

import SubscriptionPageClient from "../../../src/app/account/subscription/SubscriptionPageClient";

describe("SubscriptionPageClient (anonymous)", () => {
  it("renders sign-in prompt with returnTo", () => {
    render(<SubscriptionPageClient />);
    expect(screen.getByText(/Please sign in to manage your subscription/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Sign in to continue/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href') || '').toMatch(/\/auth\/signin\?returnTo=/);
  });
});
