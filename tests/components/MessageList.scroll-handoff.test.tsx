import React from "react";
import { render, screen, act } from "@testing-library/react";
import MessageList from "../../components/chat/MessageList";

// Minimal mocks to avoid Next.js router issues and markdown plugins
jest.mock("next/image", () => {
  const NextImageMock = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    return React.createElement("img", { alt: props.alt ?? "", ...props });
  };
  NextImageMock.displayName = "NextImageMock";
  return { __esModule: true, default: NextImageMock };
});

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

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("remark-gfm", () => ({}));
jest.mock("rehype-highlight", () => ({}));

jest.mock("../../stores/useAuthStore", () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: null }),
}));

function flushTimers() {
  jest.advanceTimersByTime(5);
}

describe("MessageList streaming scroll handoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("assigns reasoning first, then content takes over without flicker", () => {
    const { rerender } = render(
      <div style={{ height: 400 }}>
        <MessageList
          messages={[]}
          isLoading={false}
          isStreaming={true}
          reasoningEnabled={true}
          streamingReasoning={"Step 1"}
          streamingReasoningDetails={[]}
          streamingContent={""}
        />
      </div>
    );

    const reasoningPane = screen.getByTestId("streaming-reasoning");
    // Simulate a reasoning scroll height overflow to prove we scroll it
    Object.defineProperty(reasoningPane, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(reasoningPane, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(reasoningPane, "scrollTop", { value: 0, writable: true });

    // Trigger the reasoning auto-scroll effect by changing content slightly
    act(() => {
      rerender(
        <div style={{ height: 400 }}>
          <MessageList
            messages={[]}
            isLoading={false}
            isStreaming={true}
            reasoningEnabled={true}
            streamingReasoning={"Step 1 updated"}
            streamingReasoningDetails={[]}
            streamingContent={""}
          />
        </div>
      );
    });

    expect(reasoningPane.scrollTop).toBe(1000); // scrolled to bottom

    // Now update with first content chunk: content should take ownership
    // Rerender with content
    act(() => {
      rerender(
        <div style={{ height: 400 }}>
          <MessageList
            messages={[]}
            isLoading={false}
            isStreaming={true}
            reasoningEnabled={true}
            streamingReasoning={"Step 1\nStep 2"}
            streamingReasoningDetails={[]}
            streamingContent={"Hello"}
          />
        </div>
      );
    });

    const container = screen.getByTestId("messages-container");
    Object.defineProperty(container, "scrollHeight", { value: 3000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(container, "scrollTop", { value: 0, writable: true });

    // Let micro-timeout fire for content scroll
    act(() => {
      flushTimers();
    });

    expect(container.scrollTop).toBe(3000 - 500);

    // Subsequent reasoning updates should not reset container scroll ownership
    act(() => {
      rerender(
        <div style={{ height: 400 }}>
          <MessageList
            messages={[]}
            isLoading={false}
            isStreaming={true}
            reasoningEnabled={true}
            streamingReasoning={"Step 1\nStep 2\nStep 3"}
            streamingReasoningDetails={[]}
            streamingContent={"Hello world"}
          />
        </div>
      );
    });

    // Another tick for any pending timers
    act(() => {
      flushTimers();
    });

    // Ownership remains with content; container stays at bottom
    expect(container.scrollTop).toBe(3000 - 500);
  });
});
