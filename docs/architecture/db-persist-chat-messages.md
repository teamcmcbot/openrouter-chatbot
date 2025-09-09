# DB persist for chat messages

## Overview

After response of `/api/chat` or `/api/chat/stream` is received, a follow up `/api/chat/messages` is called to persist the chat messages to DB.

## Tables

- chat_sessions (for conversation metadata)
- chat_messages (for individual messages)
- chat_attachments (for image attchments & output generated images)
- message_token_costs (for token usage and costs)
- model_access (for pricing info)

## Triggers and Functions

- Function `calculate_and_record_message_cost`
  - Triggered AFTER INSERT ON public.chat_messages
    - if new message is from assistant, PERFORM `recompute_image_cost_for_user_message`
- Function `on_chat_attachment_link_recompute`
  - Triggered AFTER UPDATE OF message_id ON public.chat_attachments
    - PERFORM `recompute_image_cost_for_user_message(NEW.message_id)`

## recompute_image_cost_for_user_message(p_user_message_id TEXT)

- compute assistant message cost, using model_access pricing:

  - input tokens: model_access.prompt_price
  - output tokens: model_access.completion_price
  - websearch: model_access.websearch_price

- insert into message_token_costs
- total_cost of that row is also inserted/updated to user_usage_daily table.
  - NOTE: it seems like we are only updating user_usage_daily.estimated_cost here, message_sent/received, input/output/total tokeens are updated by another function `track_user_usage()` which is called by `update_session_stats (AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages)` and `track_session_creation (AFTER INSERT ON public.chat_sessions)`
    - `track_session_creation` increments user_usage_daily.session_created by 1
    - `update_session_stats` updates user_usage_daily.message_sent/received, input/output/total tokens by summing up chat_messages in that session

## on_chat_attachment_link_recompute()

Triggered after an orphaned attachment in chat_attachments is linked to a message in chat_messages. It calls `recompute_image_cost_for_user_message` to recompute the costs for that message.
By now the record would already have existed in message_token_costs, so it would do ON CONFLICT UPDATE to update:
image_units = EXCLUDED.image_units,
image_unit_price = EXCLUDED.image_unit_price,
image_cost = EXCLUDED.image_cost,
websearch_cost = EXCLUDED.websearch_cost,
total_cost = EXCLUDED.total_cost,
pricing_source = EXCLUDED.pricing_source;
and also update user_usage_daily.estimated_cost accordingly.

## Output Image generation

- added `model_access.output_image_price` to get output image pricing to compute output image cost in `recompute_image_cost_for_user_message`
- added `message_token_costs.output_image_units`, not required for cost calulation but for analytics and tracking
- added `message_token_costs.output_image_cost` to store output image cost
  added `chat_attachments.metadata` JSONB for source tagging (e.g., `{ "source": "assistant" | "user" }`)
- in response of `/api/chat` or `/api/chat/stream`, return the usage info including image_tokens back to frontend.

```log
[2025-09-06T13:55:33.906Z] [DEBUG] OpenRouter response received: {
  id: 'gen-1757166918-NDT6O4xrTxQOr0dXCDSA',
  provider: 'Google AI Studio',
  model: 'google/gemini-2.5-flash-image-preview',
  object: 'chat.completion',
  created: 1757166918,
  choices: [
    {
      logprobs: null,
      finish_reason: 'stop',
      native_finish_reason: 'STOP',
      index: 0,
      message: [Object]
    }
  ],
  usage: {
    prompt_tokens: 303,
    completion_tokens: 2624,
    total_tokens: 2927,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0, image_tokens: 2580 }
  }
}
```

NOTE: After response of `/api/chat` or `/api/chat/stream` is received, a follow up `/api/chat/messages` is called to persist the chat messages to DB. At this point we already have image tokens from the response and that should be included in the request payload for `/api/chat/messages`. So that when `calculate_and_record_message_cost` is triggered after insert on chat_messages, it would have the necessary info to compute the output image cost (model_access.output_image_price \* image_tokens).

Therefore the change required is to update function `recompute_image_cost_for_user_message` to include output image cost calculation logic.
