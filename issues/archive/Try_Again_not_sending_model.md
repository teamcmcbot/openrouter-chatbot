# Try Again issues

## Description

On frontend when message returns error.
ErrorDisplay shows a "Try Again" link/button.

## Model missing in retry message

When you clicked on this, it tries to resend the same user's message BUT the model is missing. It should send with the same model selected previously.

### First Payload:

```json
{
  "message": "Which team has won the most CS titles?",
  "messages": [
    {
      "id": "msg_1753174321982_ax2bdcmh8",
      "content": "Which team has won the most CS titles?",
      "role": "user",
      "timestamp": "2025-07-22T08:52:01.982Z"
    }
  ],
  "model": "moonshotai/kimi-k2:free"
}
```

### Second Payload (Try Again, model is missing in payload):

```json
{
  "message": "Which team has won the most CS titles?",
  "messages": [
    {
      "id": "msg_1753174321982_ax2bdcmh8",
      "content": "Which team has won the most CS titles?",
      "role": "user",
      "timestamp": "2025-07-22T08:52:01.982Z",
      "error": false
    },
    {
      "id": "msg_1753174343515_m3xs06mz7",
      "content": "Which team has won the most CS titles?",
      "role": "user",
      "timestamp": "2025-07-22T08:52:23.515Z"
    }
  ]
}
```

## Not a real "retry"

When the 1st message errors, the user's message shows a error icon (MessageList.tsx)
see 1st screenshot

```
{/* Error icon for failed user messages */}
                {message.role === "user" && message.error && (
                  <div className="absolute -top-1 -left-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center" title="Message failed to send">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
```

when you clicked "Try again", the first failed message error icons disappear and a second green bubble message appears instead (2nd screenshot).
It should instead retry the first failed message and not spawn a 2nd message with the same content. And if the retry is successful, the error icon will disappear and show the assistance response.
