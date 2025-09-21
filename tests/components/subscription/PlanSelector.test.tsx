import { render, screen, fireEvent } from "@testing-library/react";
import PlanSelector from "../../../components/subscription/PlanSelector";

jest.mock("next/navigation", () => require("../../../__mocks__/next/navigation"));

describe("PlanSelector", () => {
  it("shows both plans for free tier and triggers onUpgrade", () => {
    const onUpgrade = jest.fn();
    render(<PlanSelector currentTier="free" onUpgrade={onUpgrade} />);

    // Both Pro and Enterprise options should appear
    expect(screen.getByText(/Pro/i)).toBeInTheDocument();
    expect(screen.getByText(/Enterprise/i)).toBeInTheDocument();

    // Select Enterprise and continue
    fireEvent.click(screen.getByText(/Enterprise/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue checkout/i }));
    expect(onUpgrade).toHaveBeenCalledWith('enterprise');
  });

  it("shows only Enterprise when on Pro tier", () => {
    const onUpgrade = jest.fn();
    render(<PlanSelector currentTier="pro" onUpgrade={onUpgrade} />);

    expect(screen.queryByText(/Pro/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Enterprise/i)).toBeInTheDocument();
  });
});
