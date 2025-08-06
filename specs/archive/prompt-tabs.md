# Prompt Tabs Component

This component provides a user interface for selecting and inserting predefined prompts into a chat input field. It features categorized prompts with a mobile-friendly design and integrates with the existing chat application.
This component will be added to the New Chat page, specifically in the `MessageList.tsx` file when no messages are present.

## Features

- **Categorized Prompts**: Prompts are organized into categories for easy navigation.
- **Mobile-Friendly**: Designed to be responsive and usable on mobile devices.
- **Theme Integration**: Uses the emerald theme for styling, with a focus on accessibility and
- Select one category at a time, the sample prompts are displayed in a grid layout.
- **Click-to-Copy Functionality**: Users can click a prompt to copy it to the chat input field, ready for editing.
- **Accessibility**: Ensures that the component is accessible and usable across different devices and screen sizes.
- **TypeScript**: Fully typed for better maintainability and developer experience.

## Sample Categories and Prompts

```json
{
      key: "Code",
      prompts: [
        "Write code to invert a binary search tree in Python",
        "What's the difference between Promise.all and Promise.allSettled?",
        "Explain React's useEffect cleanup function",
        "Best practices for error handling in async/await"
      ]
    },
    {
      key: "Learn",
      prompts: [
        "How does GPT-4 differ from GPT-3?",
        "What is the Turing Test?",
        "Explain the concept of overfitting in machine learning",
        "What is transfer learning in AI?"
      ]
    },
    {
      key: "Explore",
      prompts: [
        "Show me trending AI research topics",
        "What are the latest advancements in natural language processing?",
        "Find open source chatbot projects",
        "List popular AI APIs"
      ]
    },
    {
      key: "Create",
      prompts: [
        "Generate a creative story about a robot and a cat",
        "Write a poem about the ocean",
        "Create a fun quiz about programming",
        "Invent a new board game concept"
      ]
    }
```
