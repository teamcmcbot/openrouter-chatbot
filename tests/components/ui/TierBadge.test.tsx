import React from "react";
import { render, screen } from "@testing-library/react";

// Mock Tooltip to avoid DOM interactions; just render children
jest.mock("../../../components/ui/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
});
