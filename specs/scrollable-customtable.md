# Custom Table

## Overview

The current `MarkdownComponents.tsx` for rendering tables is `CustomTable`. It provides a responsive and styled table layout that integrates well with the application's design system.
But on mobile devices, the table can overflow the screen width, making it difficult to read.
I want to modify the `CustomTable` component to ensure it fits within the screen width on mobile devices while maintaining its responsive design.

### Current Code

```tsx
export const CustomTable = ({ children, ...props }: CustomTableProps) => (
  <div className="overflow-x-auto my-4">
    <table
      className="min-w-full border-collapse border border-gray-300 dark:border-gray-600"
      {...props}
    >
      {children}
    </table>
  </div>
);
```

### Sample Code

This ALMOST achieve what I want in terms of a scrollable table within its own div while not overflowing the screen width. But is hardcoded to 75vw, and does not work well on all devices.
Also this is only tested on iphone 14 pro max. And the value of 75vw needs to be adjusted for different devices.
When configured to 100vw, it overflows the screen width, creating a global horizontal scrollbar.
I need this solution ONLY for small devices like mobile phones as they lack the width to display large tables. But i want to keep the same configuration for larger devices where the words are wrapped and the table fits within the screen width.

```tsx
export const CustomTable = ({ children, ...props }: CustomTableProps) => (
  <div
    className="my-4 w-screen box-border border border-red-300 dark:border-red-600"
    style={{ width: "75vw" }}
  >
    <div className="overflow-x-auto w-full border border-blue-300 dark:border-blue-600">
      <table
        className="min-w-max whitespace-nowrap border-collapse border border-gray-300 dark:border-gray-600"
        {...props}
      >
        {children}
      </table>
    </div>
  </div>
);
```

## Requirements

- On small devices, there shoud be no global horizontal scrollbar.
- The table should be scrollable horizontally within its own div.
- The table should not overflow the screen width.
- The table should maintain its responsive design and styling.
- The solution should be tested on various mobile devices to ensure compatibility.
- On larger devices, the table should still fit within the screen width without requiring horizontal scrolling and should wrap words as necessary.
