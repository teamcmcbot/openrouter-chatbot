# Mobile Actions and Attachments Update

Date: 2025-08-23

## Summary

This update improves mobile usability for conversation actions and clarifies attachment limits:

- Mobile long‑press (500ms) on ChatSidebar rows opens an Action Sheet with Delete and Edit Title.
- iOS hardening prevents text selection, touch callout, and the system context menu during long‑press.
- The selected row is highlighted; others dim to provide context; row auto‑scrolls into view.
- Action Sheet shows the conversation title and a one‑line message preview.
- Delete executes immediately (no Undo). A success toast confirms deletion.
- Image attachments are capped at 3 per message. Excess selections are trimmed and a toast explains the limit. The file input resets to allow re‑selection.
- On touch devices, attachment remove buttons are always visible; on desktop, they appear on hover.

## Follow-up (2025-09-01)

- Removed the explicit sheet title label ("Conversation actions"). The Action Sheet now only shows a contextual header with the conversation title (larger, higher contrast) and a one‑line preview.
- Edit Title occurs inline inside the Action Sheet with Save/Cancel. On successful save, the sheet closes and a success toast confirms: "Conversation title updated.".
- The one‑time discoverability hint now only appears on mobile when the ChatSidebar is open.

## User Impact

- Clear, discoverable actions on mobile via long‑press.
- Reduced friction on iOS devices with suppressed selection/callout.
- Safer composer behavior with explicit feedback for attachment limits.

## Technical Notes

- Long‑press threshold: 500ms; cancel if pointer movement > 8px.
- iOS CSS/behavior: `user-select: none`, `-webkit-touch-callout: none`, `touch-action: pan-y`, suppress `contextmenu`.
- Action Sheet accepts `contextTitle` and `contextSubtitle` props.
- Deletion: immediate call to `deleteConversation(id)` followed by `toast.success`.
- Attachment cap enforcement and input reset are implemented in `components/chat/MessageInput.tsx`.

## QA Checklist

- Long‑press opens Action Sheet on Mobile Safari and Chrome for Android.
- iOS: No text selection/callout/context menu appears on long‑press.
- Selected row highlights; others dim; row scrolls into view.
- Action Sheet shows title and one‑line preview; Cancel dismisses.
- Delete removes the conversation and shows success toast; no Undo appears.
- Attaching more than 3 images shows the error toast and trims selection; input allows immediate re‑select.
- On touch devices, remove (×) is always visible on thumbnails; desktop shows on hover.

## Related Docs

- docs/components/ChatSidebar.md
- docs/components/ui/ChatSidebar.md
- docs/components/chat/image-attachments.md
