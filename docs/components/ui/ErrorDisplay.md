# ErrorDisplay

## Purpose

- Shows an error, warning or info banner with optional actions.
- Used to present friendly messages and retry options.

## Props

| Prop           | Type                             | Required? | Description                                |
| -------------- | -------------------------------- | --------- | ------------------------------------------ |
| `title`        | `string`                         | No        | Short heading for the message.             |
| `message`      | `string`                         | Yes       | Detailed text to show.                     |
| `type`         | `'error' \| 'warning' \| 'info'` | No        | Visual style of the banner.                |
| `actionButton` | `ReactNode`                      | No        | Additional custom button.                  |
| `onRetry`      | `() => void`                     | No        | Called when the Try Again link is clicked. |

Note: The parent view hides the Retry action when the last failed user message has `retry_available === false` (prior-session failure).
| `onClose` | `() => void` | No | Dismisses the banner. |
| `suggestions` | `string[]` | No | Bulleted suggestions for fixing the error. |
| `retryAfter` | `number` | No | Seconds before retry is recommended. |
| `code` | `string` | No | Error code for special handling. |

## State Variables

- None

## useEffect Hooks

- None

## Event Handlers

- `onRetry` and `onClose` passed from the parent component.

## Data Flow

- Renders an icon and message based on `type` and displays any suggestions.

## Usage Locations

- `components/chat/ChatInterface.tsx`

## Notes for Juniors

- Retry countdown is shown only for rate limit errors (`code === 'too_many_requests'`).
