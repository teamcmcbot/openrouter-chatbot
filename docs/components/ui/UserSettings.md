# UserSettings

## Purpose
- Modal panel displaying user profile, preferences, and usage metrics.
- Currently uses placeholder data with no backend connections.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `isOpen` | `boolean` | Yes | Whether the modal is visible. |
| `onClose` | `() => void` | Yes | Callback invoked to close the modal. |

## Sections
- **Profile:** Shows email, display name, and subscription tier.
- **Preferences:** Shows theme and default model selections.
- **Analytics:** Displays dummy usage numbers for messages and tokens.

## Event Handlers
- `onClose` — closes the modal when background or Close button is clicked.

## Usage Locations
- Triggered from `ChatSidebar` via the settings icon.

## Notes for Juniors
- Replace placeholder data with real values from stores or API when backend is ready.
