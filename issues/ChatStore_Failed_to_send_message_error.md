# ChatStore Failed to Send Message Error

## Description

When `/api/chat` gets 429 error, the `ChatStore` should handle it gracefully and not throw an error.

> ### Backend Logs
>
> ```
> [2025-07-19T14:32:07.201Z] [ERROR] Error processing chat request: ApiErrorResponse: The Google model is temporarily rate-limited. Please try again in a few moments or switch to a different model.
>     at getOpenRouterCompletion (lib/utils/openrouter.ts:147:14)
>     at async POST (src/app/api/chat/route.ts:46:31)
>   145 |         }
>   146 |
> > 147 |         throw new ApiErrorResponse(
>       |              ^
>   148 |           `The ${providerName} model is temporarily rate-limited. Please try again in a few moments or switch to a different model.`,
>   149 |           ErrorCode.TOO_MANY_REQUESTS,
>   150 |           parsedError?.error?.metadata?.raw, {
>   code: 'too_many_requests',
>   details: 'google/gemini-2.0-flash-exp:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations',
>   retryAfter: 60,
>   suggestions: [Array]
> }
> [API_ERROR] ApiErrorResponse: The Google model is temporarily rate-limited. Please try again in a few moments or switch to a different model.
>     at getOpenRouterCompletion (lib/utils/openrouter.ts:147:14)
>     at async POST (src/app/api/chat/route.ts:46:31)
>   145 |         }
>   146 |
> > 147 |         throw new ApiErrorResponse(
>       |              ^
>   148 |           `The ${providerName} model is temporarily rate-limited. Please try again in a few moments or switch to a different model.`,
>   149 |           ErrorCode.TOO_MANY_REQUESTS,
>   150 |           parsedError?.error?.metadata?.raw, {
>   code: 'too_many_requests',
>   details: 'google/gemini-2.0-flash-exp:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations',
>   retryAfter: 60,
>   suggestions: [Array]
> }
>  POST /api/chat 429 in 2435ms
> ```

## Front end Next.js Console Error

When the error occurs, the frontend should not throw an error but instead handle it gracefully. However, currently, it throws an error in the console.

```
Console Error
[ChatStore] "Failed to send message" {}
```
