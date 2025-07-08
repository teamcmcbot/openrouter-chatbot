import { render, screen } from "@testing-library/react";
import {
  CustomCodeBlock,
  CustomTable,
  CustomBlockquote,
  CustomLink,
  CustomPreBlock,
} from "../../components/chat/markdown/MarkdownComponents";

describe("CustomCodeBlock", () => {
  it("renders inline code correctly", () => {
    render(
      <CustomCodeBlock inline={true}>
        console.log(&apos;hello&apos;)
      </CustomCodeBlock>
    );
    
    const codeElement = screen.getByText("console.log('hello')");
    expect(codeElement).toBeInTheDocument();
    expect(codeElement.tagName).toBe("CODE");
    expect(codeElement).toHaveClass("bg-gray-200", "dark:bg-gray-700", "px-1.5", "py-0.5", "rounded", "text-sm", "font-mono");
  });

  it("renders block code correctly", () => {
    render(
      <CustomPreBlock>
        <CustomCodeBlock inline={false}>
          {`function hello() {
  console.log('world');
}`}
        </CustomCodeBlock>
      </CustomPreBlock>
    );
    
    const codeElement = screen.getByText(/function hello\(\)/);
    expect(codeElement).toBeInTheDocument();
    expect(codeElement.tagName).toBe("CODE");
    expect(codeElement.closest("pre")).toBeInTheDocument();
  });

  it("defaults to block code when inline is not specified", () => {
    render(
      <CustomPreBlock>
        <CustomCodeBlock>
          const test = &apos;value&apos;;
        </CustomCodeBlock>
      </CustomPreBlock>
    );
    
    const element = screen.getByText("const test = 'value';");
    expect(element.closest("pre")).toBeInTheDocument();
  });
});

describe("CustomTable", () => {
  it("renders table with proper styling", () => {
    render(
      <CustomTable>
        <thead>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cell 1</td>
            <td>Cell 2</td>
          </tr>
        </tbody>
      </CustomTable>
    );
    
    const tableWrapper = screen.getByText("Header 1").closest("div");
    expect(tableWrapper).toHaveClass("overflow-x-auto", "my-4");
    
    const table = screen.getByRole("table");
    expect(table).toHaveClass("min-w-full", "border-collapse", "border", "border-gray-300", "dark:border-gray-600");
    
    expect(screen.getByText("Header 1")).toBeInTheDocument();
    expect(screen.getByText("Cell 1")).toBeInTheDocument();
  });
});

describe("CustomBlockquote", () => {
  it("renders blockquote with proper styling", () => {
    render(
      <CustomBlockquote>
        This is a quote
      </CustomBlockquote>
    );
    
    const blockquote = screen.getByText("This is a quote");
    expect(blockquote.tagName).toBe("BLOCKQUOTE");
    expect(blockquote).toHaveClass("border-l-4", "border-gray-300", "dark:border-gray-600", "pl-4", "py-2", "my-4", "italic", "text-gray-700", "dark:text-gray-300");
  });
});

describe("CustomLink", () => {
  it("renders external link with security attributes", () => {
    render(
      <CustomLink href="https://example.com">
        Click here
      </CustomLink>
    );
    
    const link = screen.getByRole("link", { name: "Click here" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("text-emerald-600", "hover:text-emerald-700", "dark:text-emerald-400", "dark:hover:text-emerald-300", "underline");
  });

  it("handles missing href gracefully", () => {
    render(
      <CustomLink>
        No href link
      </CustomLink>
    );
    
    const link = screen.getByText("No href link");
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
  });
});

describe("CustomPreBlock", () => {
  it("renders pre block with proper styling", () => {
    render(
      <CustomPreBlock>
        <code>Some code content</code>
      </CustomPreBlock>
    );
    
    const preElement = screen.getByText("Some code content").closest("pre");
    expect(preElement).toHaveClass("bg-gray-100", "dark:bg-gray-800", "rounded-lg", "p-3", "whitespace-pre-wrap", "break-words", "my-2");
  });
});
