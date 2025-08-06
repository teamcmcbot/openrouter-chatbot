# Input Tokens Not Mapped Correctly

## Bug Replication Steps

1. New conversation first message for user is sent.
2. POST /api/chat is called sucessfully.
3. Response is returned with the assistant message, input token 7, output token 1033, total token 1040.

```json
{
  "data": {
    "response": "Transfer learning is a powerful technique in Artificial Intelligence (AI) where a model trained on one task is **repurposed or adapted to perform a related but different task.** Instead of training a new model from scratch, which can be time-consuming and require vast amounts of data, transfer learning leverages the knowledge gained from a pre-existing model.\n\nThink of it like this:\n\n*   **Learning to ride a bicycle:** Once you've mastered riding a bicycle, learning to ride a motorcycle becomes easier. You already understand balance, steering, and the concept of propulsion. You don't have to start from absolutely zero.\n*   **Learning a new language:** If you already speak Spanish, learning Italian will be significantly easier than learning Mandarin. Many grammatical structures and vocabulary will be similar.\n\n**Key Concepts and Components:**\n\n1.  **Source Task/Domain:** The task or dataset the model was originally trained on. This is typically a large, general-purpose dataset.\n2.  **Target Task/Domain:** The new, related task or dataset you want to adapt the model for. This dataset is often smaller.\n3.  **Pre-trained Model:** The model that has already been trained on the source task. These are often deep neural networks.\n4.  **Knowledge Transfer:** The process of using the learned features, patterns, and weights from the pre-trained model for the new task.\n\n**How Does it Work?**\n\nDeep neural networks, especially in areas like computer vision and natural language processing, learn hierarchical representations of data.\n\n*   **Early layers (closer to the input):** These layers learn very general features, like edges, corners, and basic textures in images, or simple word embeddings and grammatical structures in text.\n*   **Later layers (closer to the output):** These layers learn more specific and complex features relevant to the original task, like object parts or full objects in images, or sentiment and meaning in text.\n\nWhen performing transfer learning, we typically:\n\n*   **Keep the early layers frozen or fine-tune them slightly:** These general features are usually transferable to new, related tasks.\n*   **Replace or retrain the later layers:** These layers are more specialized to the original task. We adapt them to learn the specific features required for the new target task.\n\n**Common Transfer Learning Strategies:**\n\n1.  **Feature Extraction:**\n    *   Take a pre-trained model.\n    *   Remove the final output layer(s).\n    *   Use the remaining layers as a fixed feature extractor.\n    *   Train a new, simpler classifier (like a logistic regression or a small neural network) on top of these extracted features for the target task.\n    *   **Use case:** When the target dataset is very small and the source task is very similar to the target task.\n\n2.  **Fine-tuning:**\n    *   Take a pre-trained model.\n    *   Replace the final output layer(s) with new ones suited for the target task.\n    *   Unfreeze some or all of the layers of the pre-trained model.\n    *   Train the entire model (or parts of it) on the new target dataset with a lower learning rate. This allows the model to adapt its learned features to the nuances of the new task.\n    *   **Use case:** When the target dataset is larger or the target task is slightly different from the source task.\n\n**Why is Transfer Learning Important?**\n\n*   **Reduces the need for large datasets:** Training complex AI models from scratch requires massive amounts of labeled data, which is often expensive and difficult to obtain. Transfer learning allows us to achieve good performance with smaller datasets.\n*   **Saves training time and computational resources:** Pre-trained models have already undergone extensive training, significantly reducing the time and computational power needed to train a new model.\n*   **Improves performance:** By leveraging knowledge from a well-trained model, we can often achieve better accuracy and generalization on the target task than if we trained from scratch.\n*   **Enables AI in specialized domains:** It allows us to build AI systems for niche applications where large datasets are scarce.\n\n**Examples of Transfer Learning in Practice:**\n\n*   **Computer Vision:** Using models pre-trained on ImageNet (a massive dataset of diverse images) for tasks like medical image analysis, object detection in surveillance footage, or classifying specific types of plants.\n*   **Natural Language Processing (NLP):** Using models like BERT, GPT, or RoBERTa (pre-trained on vast amounts of text data) for tasks like sentiment analysis, text summarization, question answering, or machine translation.\n*   **Audio Processing:** Using models trained on large audio datasets for tasks like speech recognition in different accents or identifying specific types of sounds.\n\nIn summary, transfer learning is a cornerstone of modern AI development, enabling more efficient, effective, and accessible AI solutions by building upon existing knowledge.",
    "usage": {
      "prompt_tokens": 7,
      "completion_tokens": 1033,
      "total_tokens": 1040
    },
    "request_id": "msg_1753438380225_dfhbllpgq",
    "timestamp": "2025-07-25T10:13:05.163Z",
    "elapsed_time": 2,
    "contentType": "markdown",
    "id": "gen-1753438383-8WbDOBN3Jm3kv0qB8ys4"
  },
  "timestamp": "2025-07-25T10:13:05.163Z"
}
```

4. Sync endpoint is called with the conversation data, which includes the above message and metadata. All values are still working as expected.

```json
{
  "conversations": [
    {
      "id": "conv_1753438380224_focmdsm2k",
      "title": "What is transfer learning in AI?",
      "messages": [
        {
          "id": "msg_1753438380225_dfhbllpgq",
          "content": "What is transfer learning in AI?",
          "role": "user",
          "timestamp": "2025-07-25T10:13:00.225Z",
          "originalModel": "google/gemini-2.5-flash-lite",
          "input_tokens": 7
        },
        {
          "id": "msg_1753438385166_7x071tf7k",
          "content": "Transfer learning is a powerful technique in Artificial Intelligence (AI) where a model trained on one task is **repurposed or adapted to perform a related but different task.** Instead of training a new model from scratch, which can be time-consuming and require vast amounts of data, transfer learning leverages the knowledge gained from a pre-existing model.\n\nThink of it like this:\n\n*   **Learning to ride a bicycle:** Once you've mastered riding a bicycle, learning to ride a motorcycle becomes easier. You already understand balance, steering, and the concept of propulsion. You don't have to start from absolutely zero.\n*   **Learning a new language:** If you already speak Spanish, learning Italian will be significantly easier than learning Mandarin. Many grammatical structures and vocabulary will be similar.\n\n**Key Concepts and Components:**\n\n1.  **Source Task/Domain:** The task or dataset the model was originally trained on. This is typically a large, general-purpose dataset.\n2.  **Target Task/Domain:** The new, related task or dataset you want to adapt the model for. This dataset is often smaller.\n3.  **Pre-trained Model:** The model that has already been trained on the source task. These are often deep neural networks.\n4.  **Knowledge Transfer:** The process of using the learned features, patterns, and weights from the pre-trained model for the new task.\n\n**How Does it Work?**\n\nDeep neural networks, especially in areas like computer vision and natural language processing, learn hierarchical representations of data.\n\n*   **Early layers (closer to the input):** These layers learn very general features, like edges, corners, and basic textures in images, or simple word embeddings and grammatical structures in text.\n*   **Later layers (closer to the output):** These layers learn more specific and complex features relevant to the original task, like object parts or full objects in images, or sentiment and meaning in text.\n\nWhen performing transfer learning, we typically:\n\n*   **Keep the early layers frozen or fine-tune them slightly:** These general features are usually transferable to new, related tasks.\n*   **Replace or retrain the later layers:** These layers are more specialized to the original task. We adapt them to learn the specific features required for the new target task.\n\n**Common Transfer Learning Strategies:**\n\n1.  **Feature Extraction:**\n    *   Take a pre-trained model.\n    *   Remove the final output layer(s).\n    *   Use the remaining layers as a fixed feature extractor.\n    *   Train a new, simpler classifier (like a logistic regression or a small neural network) on top of these extracted features for the target task.\n    *   **Use case:** When the target dataset is very small and the source task is very similar to the target task.\n\n2.  **Fine-tuning:**\n    *   Take a pre-trained model.\n    *   Replace the final output layer(s) with new ones suited for the target task.\n    *   Unfreeze some or all of the layers of the pre-trained model.\n    *   Train the entire model (or parts of it) on the new target dataset with a lower learning rate. This allows the model to adapt its learned features to the nuances of the new task.\n    *   **Use case:** When the target dataset is larger or the target task is slightly different from the source task.\n\n**Why is Transfer Learning Important?**\n\n*   **Reduces the need for large datasets:** Training complex AI models from scratch requires massive amounts of labeled data, which is often expensive and difficult to obtain. Transfer learning allows us to achieve good performance with smaller datasets.\n*   **Saves training time and computational resources:** Pre-trained models have already undergone extensive training, significantly reducing the time and computational power needed to train a new model.\n*   **Improves performance:** By leveraging knowledge from a well-trained model, we can often achieve better accuracy and generalization on the target task than if we trained from scratch.\n*   **Enables AI in specialized domains:** It allows us to build AI systems for niche applications where large datasets are scarce.\n\n**Examples of Transfer Learning in Practice:**\n\n*   **Computer Vision:** Using models pre-trained on ImageNet (a massive dataset of diverse images) for tasks like medical image analysis, object detection in surveillance footage, or classifying specific types of plants.\n*   **Natural Language Processing (NLP):** Using models like BERT, GPT, or RoBERTa (pre-trained on vast amounts of text data) for tasks like sentiment analysis, text summarization, question answering, or machine translation.\n*   **Audio Processing:** Using models trained on large audio datasets for tasks like speech recognition in different accents or identifying specific types of sounds.\n\nIn summary, transfer learning is a cornerstone of modern AI development, enabling more efficient, effective, and accessible AI solutions by building upon existing knowledge.",
          "role": "assistant",
          "timestamp": "2025-07-25T10:13:05.166Z",
          "elapsed_time": 2,
          "total_tokens": 1040,
          "input_tokens": 7,
          "output_tokens": 1033,
          "user_message_id": "msg_1753438380225_dfhbllpgq",
          "model": "google/gemini-2.5-flash-lite",
          "contentType": "markdown",
          "completion_id": "gen-1753438383-8WbDOBN3Jm3kv0qB8ys4"
        }
      ],
      "userId": "6324e1ee-1a7b-450c-8c9f-130e895696c2",
      "createdAt": "2025-07-25T10:13:00.224Z",
      "updatedAt": "2025-07-25T10:13:05.167Z",
      "messageCount": 2,
      "totalTokens": 1040,
      "isActive": true,
      "lastMessagePreview": "Transfer learning is a powerful technique in Artificial Intelligence (AI) where a model trained on o...",
      "lastMessageTimestamp": "2025-07-25T10:13:05.166Z",
      "lastModel": "google/gemini-2.5-flash-lite"
    }
  ]
}
```

5. Send a second message and receive assistant response. NOTE input token for this user/assistant pair is 1044.

```json
{
  "data": {
    "response": "RAG stands for **Retrieval-Augmented Generation**. It's a technique that combines the power of large language models (LLMs) with external knowledge bases to generate more accurate, factual, and contextually relevant responses.\n\nEssentially, RAG aims to overcome a common limitation of LLMs: their tendency to \"hallucinate\" or generate plausible-sounding but incorrect information. LLMs are trained on vast amounts of text, but their knowledge is static and can become outdated. They don't inherently \"know\" everything or have access to the most up-to-date information.\n\n**How RAG Works (The \"Retrieval\" and \"Generation\" Parts):**\n\n1.  **Retrieval:**\n    *   When a user asks a question or provides a prompt, the RAG system first **retrieves** relevant information from an external knowledge source. This knowledge source can be:\n        *   **A custom database:** This could be your company's internal documents, a specific research paper archive, or a collection of product manuals.\n        *   **A vector database:** This is a database optimized for storing and searching embeddings (numerical representations of text).\n        *   **The internet:** Though this can be more complex to manage for accuracy.\n    *   The retrieval process typically involves converting the user's query into a search query that can effectively find relevant documents or passages within the knowledge base. This often uses techniques like **semantic search** to find content based on meaning rather than just keywords.\n\n2.  **Augmentation:**\n    *   The retrieved information (e.g., relevant text snippets, facts, data points) is then **augmented** to the original user prompt. This means the retrieved content is prepended or injected into the prompt that is sent to the LLM.\n\n3.  **Generation:**\n    *   The LLM receives the augmented prompt, which now includes both the original query and the retrieved context.\n    *   The LLM then uses this combined input to **generate** a response. Because the LLM has access to specific, relevant, and often up-to-date information from the retrieved context, its generated response is more likely to be:\n        *   **Factual:** Grounded in real-world data.\n        *   **Accurate:** Less prone to making things up.\n        *   **Contextually relevant:** Directly addresses the user's query with the specific information provided.\n        *   **Up-to-date:** Can incorporate recent information if the knowledge base is updated.\n\n**Analogy:**\n\nImagine you're asking a highly intelligent but slightly forgetful friend a question.\n\n*   **Without RAG:** You ask your friend, and they try to recall the answer from their general knowledge. They might get it right, but they could also misremember or invent something.\n*   **With RAG:** You ask your friend, and before they answer, you hand them a relevant book or document containing the exact information. Now, they can read that information and give you a precise and accurate answer.\n\n**Key Benefits of RAG:**\n\n*   **Reduces Hallucinations:** By providing factual grounding, RAG significantly minimizes the LLM's tendency to generate incorrect information.\n*   **Enables Access to Up-to-date Information:** LLMs are trained on historical data. RAG allows them to access and incorporate current information from external sources.\n*   **Improves Domain-Specific Knowledge:** For specialized fields (e.g., medicine, law, finance), RAG allows LLMs to draw upon specific, authoritative knowledge bases, making them much more useful in those domains.\n*   **Increases Transparency and Trust:** Users can often see the sources that the LLM used to generate its answer, increasing trust in the output.\n*   **Customization and Personalization:** Organizations can use RAG to tailor LLM responses to their specific data and needs.\n*   **Cost-Effectiveness:** It's often more efficient to update an external knowledge base than to retrain an entire LLM.\n\n**Common Use Cases for RAG:**\n\n*   **Question Answering Systems:** Building chatbots that can answer questions about specific products, services, or internal company policies.\n*   **Content Creation:** Generating articles, reports, or summaries based on provided research materials.\n*   **Customer Support:** Empowering chatbots to provide accurate and detailed answers to customer inquiries.\n*   **Code Generation:** Assisting developers by retrieving relevant code snippets or documentation.\n*   **Research Assistance:** Helping researchers find and synthesize information from large bodies of text.\n\nRAG is a crucial advancement in making LLMs more reliable, practical, and useful for a wide range of real-world applications.",
    "usage": {
      "prompt_tokens": 1044,
      "completion_tokens": 976,
      "total_tokens": 2020
    },
    "request_id": "msg_1753438380225_dfhbllpgq",
    "timestamp": "2025-07-25T10:14:44.966Z",
    "elapsed_time": 2,
    "contentType": "markdown",
    "id": "gen-1753438482-nqjKzecCHvUvNNiePUxg"
  },
  "timestamp": "2025-07-25T10:14:44.966Z"
}
```

6. In the UI, the first message which is supposed to be 7 input token, changed into 1044 instead.

```
What is transfer learning in AI?

18:13
(1044 input tokens)
```

7. The 2nd pair of user message which is supposed to be 1044 input token, is showing nothing instead.

```
what is RAG?

18:14


```

8. The next sync payload is also reflecting the same issue, where the first message input token is 1044 instead of 7.

```json
{
  "conversations": [
    {
      "id": "conv_1753438380224_focmdsm2k",
      "title": "What is transfer learning in AI?",
      "messages": [
        {
          "id": "msg_1753438380225_dfhbllpgq",
          "content": "What is transfer learning in AI?",
          "role": "user",
          "timestamp": "2025-07-25T10:13:00.225Z",
          "originalModel": "google/gemini-2.5-flash-lite",
          "input_tokens": 1044
        },
        {
          "id": "msg_1753438385166_7x071tf7k",
          "content": "Transfer learning is a powerful technique in Artificial Intelligence (AI) where a model trained on one task is **repurposed or adapted to perform a related but different task.** Instead of training a new model from scratch, which can be time-consuming and require vast amounts of data, transfer learning leverages the knowledge gained from a pre-existing model.\n\nThink of it like this:\n\n*   **Learning to ride a bicycle:** Once you've mastered riding a bicycle, learning to ride a motorcycle becomes easier. You already understand balance, steering, and the concept of propulsion. You don't have to start from absolutely zero.\n*   **Learning a new language:** If you already speak Spanish, learning Italian will be significantly easier than learning Mandarin. Many grammatical structures and vocabulary will be similar.\n\n**Key Concepts and Components:**\n\n1.  **Source Task/Domain:** The task or dataset the model was originally trained on. This is typically a large, general-purpose dataset.\n2.  **Target Task/Domain:** The new, related task or dataset you want to adapt the model for. This dataset is often smaller.\n3.  **Pre-trained Model:** The model that has already been trained on the source task. These are often deep neural networks.\n4.  **Knowledge Transfer:** The process of using the learned features, patterns, and weights from the pre-trained model for the new task.\n\n**How Does it Work?**\n\nDeep neural networks, especially in areas like computer vision and natural language processing, learn hierarchical representations of data.\n\n*   **Early layers (closer to the input):** These layers learn very general features, like edges, corners, and basic textures in images, or simple word embeddings and grammatical structures in text.\n*   **Later layers (closer to the output):** These layers learn more specific and complex features relevant to the original task, like object parts or full objects in images, or sentiment and meaning in text.\n\nWhen performing transfer learning, we typically:\n\n*   **Keep the early layers frozen or fine-tune them slightly:** These general features are usually transferable to new, related tasks.\n*   **Replace or retrain the later layers:** These layers are more specialized to the original task. We adapt them to learn the specific features required for the new target task.\n\n**Common Transfer Learning Strategies:**\n\n1.  **Feature Extraction:**\n    *   Take a pre-trained model.\n    *   Remove the final output layer(s).\n    *   Use the remaining layers as a fixed feature extractor.\n    *   Train a new, simpler classifier (like a logistic regression or a small neural network) on top of these extracted features for the target task.\n    *   **Use case:** When the target dataset is very small and the source task is very similar to the target task.\n\n2.  **Fine-tuning:**\n    *   Take a pre-trained model.\n    *   Replace the final output layer(s) with new ones suited for the target task.\n    *   Unfreeze some or all of the layers of the pre-trained model.\n    *   Train the entire model (or parts of it) on the new target dataset with a lower learning rate. This allows the model to adapt its learned features to the nuances of the new task.\n    *   **Use case:** When the target dataset is larger or the target task is slightly different from the source task.\n\n**Why is Transfer Learning Important?**\n\n*   **Reduces the need for large datasets:** Training complex AI models from scratch requires massive amounts of labeled data, which is often expensive and difficult to obtain. Transfer learning allows us to achieve good performance with smaller datasets.\n*   **Saves training time and computational resources:** Pre-trained models have already undergone extensive training, significantly reducing the time and computational power needed to train a new model.\n*   **Improves performance:** By leveraging knowledge from a well-trained model, we can often achieve better accuracy and generalization on the target task than if we trained from scratch.\n*   **Enables AI in specialized domains:** It allows us to build AI systems for niche applications where large datasets are scarce.\n\n**Examples of Transfer Learning in Practice:**\n\n*   **Computer Vision:** Using models pre-trained on ImageNet (a massive dataset of diverse images) for tasks like medical image analysis, object detection in surveillance footage, or classifying specific types of plants.\n*   **Natural Language Processing (NLP):** Using models like BERT, GPT, or RoBERTa (pre-trained on vast amounts of text data) for tasks like sentiment analysis, text summarization, question answering, or machine translation.\n*   **Audio Processing:** Using models trained on large audio datasets for tasks like speech recognition in different accents or identifying specific types of sounds.\n\nIn summary, transfer learning is a cornerstone of modern AI development, enabling more efficient, effective, and accessible AI solutions by building upon existing knowledge.",
          "role": "assistant",
          "timestamp": "2025-07-25T10:13:05.166Z",
          "elapsed_time": 2,
          "total_tokens": 1040,
          "input_tokens": 7,
          "output_tokens": 1033,
          "user_message_id": "msg_1753438380225_dfhbllpgq",
          "model": "google/gemini-2.5-flash-lite",
          "contentType": "markdown",
          "completion_id": "gen-1753438383-8WbDOBN3Jm3kv0qB8ys4"
        },
        {
          "id": "msg_1753438481030_98vw7vbao",
          "content": "what is RAG?",
          "role": "user",
          "timestamp": "2025-07-25T10:14:41.030Z",
          "originalModel": "google/gemini-2.5-flash-lite"
        },
        {
          "id": "msg_1753438484969_0ybroc6jk",
          "content": "RAG stands for **Retrieval-Augmented Generation**. It's a technique that combines the power of large language models (LLMs) with external knowledge bases to generate more accurate, factual, and contextually relevant responses.\n\nEssentially, RAG aims to overcome a common limitation of LLMs: their tendency to \"hallucinate\" or generate plausible-sounding but incorrect information. LLMs are trained on vast amounts of text, but their knowledge is static and can become outdated. They don't inherently \"know\" everything or have access to the most up-to-date information.\n\n**How RAG Works (The \"Retrieval\" and \"Generation\" Parts):**\n\n1.  **Retrieval:**\n    *   When a user asks a question or provides a prompt, the RAG system first **retrieves** relevant information from an external knowledge source. This knowledge source can be:\n        *   **A custom database:** This could be your company's internal documents, a specific research paper archive, or a collection of product manuals.\n        *   **A vector database:** This is a database optimized for storing and searching embeddings (numerical representations of text).\n        *   **The internet:** Though this can be more complex to manage for accuracy.\n    *   The retrieval process typically involves converting the user's query into a search query that can effectively find relevant documents or passages within the knowledge base. This often uses techniques like **semantic search** to find content based on meaning rather than just keywords.\n\n2.  **Augmentation:**\n    *   The retrieved information (e.g., relevant text snippets, facts, data points) is then **augmented** to the original user prompt. This means the retrieved content is prepended or injected into the prompt that is sent to the LLM.\n\n3.  **Generation:**\n    *   The LLM receives the augmented prompt, which now includes both the original query and the retrieved context.\n    *   The LLM then uses this combined input to **generate** a response. Because the LLM has access to specific, relevant, and often up-to-date information from the retrieved context, its generated response is more likely to be:\n        *   **Factual:** Grounded in real-world data.\n        *   **Accurate:** Less prone to making things up.\n        *   **Contextually relevant:** Directly addresses the user's query with the specific information provided.\n        *   **Up-to-date:** Can incorporate recent information if the knowledge base is updated.\n\n**Analogy:**\n\nImagine you're asking a highly intelligent but slightly forgetful friend a question.\n\n*   **Without RAG:** You ask your friend, and they try to recall the answer from their general knowledge. They might get it right, but they could also misremember or invent something.\n*   **With RAG:** You ask your friend, and before they answer, you hand them a relevant book or document containing the exact information. Now, they can read that information and give you a precise and accurate answer.\n\n**Key Benefits of RAG:**\n\n*   **Reduces Hallucinations:** By providing factual grounding, RAG significantly minimizes the LLM's tendency to generate incorrect information.\n*   **Enables Access to Up-to-date Information:** LLMs are trained on historical data. RAG allows them to access and incorporate current information from external sources.\n*   **Improves Domain-Specific Knowledge:** For specialized fields (e.g., medicine, law, finance), RAG allows LLMs to draw upon specific, authoritative knowledge bases, making them much more useful in those domains.\n*   **Increases Transparency and Trust:** Users can often see the sources that the LLM used to generate its answer, increasing trust in the output.\n*   **Customization and Personalization:** Organizations can use RAG to tailor LLM responses to their specific data and needs.\n*   **Cost-Effectiveness:** It's often more efficient to update an external knowledge base than to retrain an entire LLM.\n\n**Common Use Cases for RAG:**\n\n*   **Question Answering Systems:** Building chatbots that can answer questions about specific products, services, or internal company policies.\n*   **Content Creation:** Generating articles, reports, or summaries based on provided research materials.\n*   **Customer Support:** Empowering chatbots to provide accurate and detailed answers to customer inquiries.\n*   **Code Generation:** Assisting developers by retrieving relevant code snippets or documentation.\n*   **Research Assistance:** Helping researchers find and synthesize information from large bodies of text.\n\nRAG is a crucial advancement in making LLMs more reliable, practical, and useful for a wide range of real-world applications.",
          "role": "assistant",
          "timestamp": "2025-07-25T10:14:44.969Z",
          "elapsed_time": 2,
          "total_tokens": 2020,
          "input_tokens": 1044,
          "output_tokens": 976,
          "user_message_id": "msg_1753438380225_dfhbllpgq",
          "model": "google/gemini-2.5-flash-lite",
          "contentType": "markdown",
          "completion_id": "gen-1753438482-nqjKzecCHvUvNNiePUxg"
        }
      ],
      "userId": "6324e1ee-1a7b-450c-8c9f-130e895696c2",
      "createdAt": "2025-07-25T10:13:00.224Z",
      "updatedAt": "2025-07-25T10:14:44.969Z",
      "messageCount": 4,
      "totalTokens": 3060,
      "isActive": true,
      "lastMessagePreview": "RAG stands for **Retrieval-Augmented Generation**. It's a technique that combines the power of large...",
      "lastMessageTimestamp": "2025-07-25T10:14:44.969Z",
      "lastModel": "google/gemini-2.5-flash-lite"
    }
  ]
}
```

## Issue Summary

This resulted in the analytics wrongly updated and showing more input tokens consumed than actually used by the user. This is a critical issue as it affects the accuracy of user analytics and could lead to incorrect billing or usage reports.
