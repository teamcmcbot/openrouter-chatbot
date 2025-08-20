import { render, screen, act } from "@testing-library/react";
import Toaster from "../../../components/ui/Toaster";
import toast from "react-hot-toast";

// Minimal router mocks for components using next/navigation when needed
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Ensure matchMedia exists for jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: query.includes("prefers-color-scheme: dark") ? false : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

// Stub ResizeObserver used by Toaster positioning logic
class ResizeObserverMock {
  observe: ResizeObserver["observe"] = jest.fn();
  unobserve: ResizeObserver["unobserve"] = jest.fn();
  disconnect: ResizeObserver["disconnect"] = jest.fn();
}

(window as unknown as Record<string, unknown>)["ResizeObserver"] =
  ResizeObserverMock as unknown;

describe("Toaster warning class", () => {
  it("renders a warning toast with .toast-warning class inside .app-toaster", async () => {
    render(<Toaster />);

    await act(async () => {
      toast("Heads up", { className: "toast-warning", icon: "⚠️" });
    });

    // Container should exist
    const container = document.querySelector(".app-toaster");
    expect(container).toBeTruthy();

    // The warning toast should be a descendant with the class applied
    const warningEl = container?.querySelector(".toast-warning");
    expect(warningEl).toBeTruthy();

    // Assert the text content is present
    expect(screen.getByText("Heads up")).toBeInTheDocument();
  });
});
