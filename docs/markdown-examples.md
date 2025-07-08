# Markdown Usage Examples

## Basic Formatting

### Headers

```markdown
# Header 1

## Header 2

### Header 3
```

### Text Formatting

```markdown
**Bold text**
_Italic text_
~~Strikethrough~~
`Inline code`
```

### Lists

```markdown
- Unordered list item 1
- Unordered list item 2
  - Nested item

1. Ordered list item 1
2. Ordered list item 2
   1. Nested ordered item
```

### Links and Images

```markdown
[Link text](https://example.com)
![Alt text](https://example.com/image.png)
```

## Advanced Features

### Code Blocks

````markdown
```javascript
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

console.log(factorial(5)); // Output: 120
```
````

### Tables

```markdown
| Language   | Paradigm       | Year |
| ---------- | -------------- | ---- |
| JavaScript | Multi-paradigm | 1995 |
| Python     | Multi-paradigm | 1991 |
| Rust       | Systems        | 2010 |
```

### Blockquotes

```markdown
> "The best way to predict the future is to invent it."
>
> - Alan Kay
```

### Task Lists

```markdown
- [x] Completed task
- [ ] Pending task
- [ ] Another pending task
```

## Real-world Examples

### API Documentation Response

````markdown
# User Authentication API

## Endpoint

`POST /api/auth/login`

### Request Body

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```
````

### Response

| Status | Description         |
| ------ | ------------------- |
| 200    | Success             |
| 401    | Invalid credentials |
| 429    | Rate limited        |

### Example Usage

```javascript
const response = await fetch("/api/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password }),
});
```

````

### Code Review Response
```markdown
## Code Review Comments

### ✅ Positive Changes
- Clean separation of concerns
- Proper error handling implementation
- Good use of TypeScript types

### 🔧 Suggestions
1. **Performance**: Consider memoizing the `calculateTotal` function
2. **Testing**: Add unit tests for edge cases
3. **Documentation**: Add JSDoc comments for public methods

### Code Example
```typescript
// Before
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// After (memoized)
const calculateTotal = useMemo(() =>
  (items: Item[]): number =>
    items.reduce((sum, item) => sum + item.price, 0),
  []
);
````

### Next Steps

- [ ] Address performance suggestions
- [ ] Add unit tests
- [ ] Update documentation

````

### Tutorial Response
```markdown
# React Hooks Tutorial

## Introduction
React Hooks let you use state and other React features in functional components.

## useState Hook

### Basic Example
```jsx
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
````

### Key Points

- `useState` returns an array with two elements
- First element is the current state value
- Second element is a function to update the state

## useEffect Hook

### Basic Example

```jsx
import React, { useState, useEffect } from "react";

function DataFetcher() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData().then(setData);
  }, []); // Empty dependency array means run once on mount

  return <div>{data ? JSON.stringify(data) : "Loading..."}</div>;
}
```

### Cleanup

```jsx
useEffect(() => {
  const timer = setInterval(() => {
    console.log("Timer tick");
  }, 1000);

  return () => clearInterval(timer); // Cleanup function
}, []);
```

````

## Common Patterns

### Mixed Content
Responses can contain both plain text and formatted content:

```markdown
Here's a simple explanation followed by a code example:

The `useState` hook is fundamental in React. Here's how it works:

```javascript
const [state, setState] = useState(initialValue);
````

Key points:

- Always use the setter function to update state
- State updates are asynchronous
- Multiple state updates in the same render are batched

````

### Error Messages
```markdown
## Error Analysis

❌ **Issue**: `Cannot read property 'map' of undefined`

### Possible Causes:
1. Data not loaded yet
2. API returned null/undefined
3. Component rendered before data fetch completed

### Solution:
```javascript
// Add null check
{data && data.map(item => (
  <div key={item.id}>{item.name}</div>
))}

// Or use optional chaining
{data?.map(item => (
  <div key={item.id}>{item.name}</div>
))}
````

```

## Best Practices

1. **Keep it readable**: Use proper spacing and formatting
2. **Code blocks**: Always specify language for syntax highlighting
3. **Tables**: Use for structured data comparison
4. **Lists**: Great for step-by-step instructions
5. **Blockquotes**: Highlight important notes or quotes
```
