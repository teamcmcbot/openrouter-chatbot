# Features Todo List

- Attachment image/pdf support, only enabled for models that support it and for authenticated users only
- Configure Reasoning Mode, for models that support it.
- Option to send or not send context (previous messages) to save input tokens
- User settings preference on number of messages to retain in context
- Streaming? Is it even possible to support this in our current architecture? Where we detect if the api response contains markdown data and set accordingly and render depends on this flag etc..
- Web search option? https://openrouter.ai/announcements/introducing-web-search-via-the-api

## Analytics features

- Admin analytics: what do we want to see?
- Anonymous usage statistics, currently is not tracked since they do not have user ID as is not synced to DB.
