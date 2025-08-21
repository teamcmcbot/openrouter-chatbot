import React from "react";
import { render, screen } from "@testing-library/react";

// Mock Tooltip to avoid DOM interactions; render children and the content inline
jest.mock("../../../components/ui/Tooltip", () => ({
  __esModule: true,
  default: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => (
    <div>
      {children}
      <div>{content}</div>
    </div>
  ),
}));

import TierBadge from "../../../components/ui/TierBadge";

describe("TierBadge", () => {
  it("renders Anonymous label for anonymous tier", () => {
    render(<TierBadge tier="anonymous" showTooltip={false} />);
    expect(screen.getByText(/Anonymous/i)).toBeInTheDocument();
  });

  it("renders Pro label for pro tier", () => {
    render(<TierBadge tier="pro" showTooltip={false} />);
    expect(screen.getByText(/Pro/i)).toBeInTheDocument();
  });

  it("shows Feature Access with correct entitlements for Free", () => {
    render(<TierBadge tier="free" showTooltip={true} />);
    expect(screen.getByText(/Feature Access/i)).toBeInTheDocument();
    expect(screen.getByText(/Web Search/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^No$/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows Web Search enabled for Pro and Reasoning not available", () => {
    render(<TierBadge tier="pro" showTooltip={true} />);
  // Web Search enabled
    expect(screen.getByText(/Web Search/i)).toBeInTheDocument();
  expect(screen.getAllByText(/^Yes$/i).length).toBeGreaterThanOrEqual(1);
    // Reasoning not available on Pro
    expect(screen.getByText(/Reasoning/i)).toBeInTheDocument();
  });

  it("shows all three enabled on Enterprise (except limits note)", () => {
    render(<TierBadge tier="enterprise" showTooltip={true} />);
    expect(screen.getByText(/Web Search/i)).toBeInTheDocument();
    expect(screen.getByText(/Reasoning/i)).toBeInTheDocument();
    expect(screen.getByText(/Image attachments/i)).toBeInTheDocument();
  });
});
