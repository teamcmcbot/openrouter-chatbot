# Logo

## Purpose
- Displays the application logo SVG.
- `LogoWithText` variant also renders the brand name.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `className` | `string` | No | CSS classes for the `<svg>` wrapper. |
| `size` | `number` | No | Width and height of the icon in pixels. |

## State Variables
- None

## useEffect Hooks
- None

## Event Handlers
- None

## Data Flow
- Renders an inline SVG scaled to the provided `size`.
- `LogoWithText` reads `process.env.BRAND_NAME` for the label.

## Usage Locations
- `src/app/layout.tsx`

## Notes for Juniors
- Customize the logo by editing the SVG paths.
- Remember to provide a fallback brand name if `BRAND_NAME` is undefined.
