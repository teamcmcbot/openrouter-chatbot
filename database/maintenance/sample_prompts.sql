-- ============================================================================
-- SAMPLE CONVERSATION PROMPTS - Generate Organic Test Data
-- ============================================================================
-- Purpose: 30 diverse prompts covering various topics to generate realistic
--          conversation data for testing search performance
-- Usage: Copy these prompts and send them via your chat UI to create conversations
-- ============================================================================

1. "Explain quantum entanglement in simple terms with examples"

2. "Write a Python script to scrape weather data from a public API and store it in PostgreSQL"

3. "What are the best practices for implementing authentication in Next.js 14 with Supabase?"

4. "Help me debug this error: 'TypeError: Cannot read property of undefined' in my React component"

5. "Compare REST API vs GraphQL for a microservices architecture. What are the tradeoffs?"

6. "Create a comprehensive meal plan for someone trying to build muscle while staying under 2500 calories per day"

7. "Explain the Byzantine Generals Problem and how blockchain solves it"

8. "Write a detailed business plan for a SaaS product that helps small businesses manage inventory"

9. "What are the key differences between TypeScript interfaces and types? When should I use each?"

10. "Generate a Redis caching strategy for a high-traffic e-commerce application"

11. "Explain how GPT models work under the hood, including attention mechanisms and transformers"

12. "Write SQL queries to analyze user retention rates over the past 6 months"

13. "What are the environmental impacts of AI training, and how can we reduce the carbon footprint?"

14. "Create a step-by-step guide for deploying a Docker containerized app to AWS ECS"

15. "Explain the concept of eventual consistency in distributed databases like DynamoDB"

16. "Write a comprehensive guide on implementing rate limiting in serverless functions"

17. "What are the pros and cons of using Tailwind CSS versus traditional CSS methodologies?"

18. "Help me optimize this slow SQL query that joins 5 tables and takes 30 seconds to run"

19. "Explain how OAuth 2.0 works with a real-world example using Google Sign-In"

20. "Create a marketing strategy for launching a new AI-powered productivity tool"

21. "What are the best practices for handling sensitive data and PII in production databases?"

22. "Write a comprehensive guide on implementing WebSockets for real-time chat functionality"

23. "Explain the differences between horizontal and vertical scaling with concrete examples"

24. "Generate test cases for a payment processing system including edge cases and error scenarios"

25. "What are the key principles of domain-driven design and when should it be applied?"

26. "Write a detailed comparison of Stripe, PayPal, and Square for e-commerce payment processing"

27. "Explain how to implement proper error handling and logging in a production Node.js application"

28. "Create a security checklist for auditing a web application before production deployment"

29. "What are the best practices for database indexing? When do indexes hurt performance?"

30. "Write a guide on implementing feature flags and A/B testing in a React application"

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================
-- 1. Start your local development server: npm run dev
-- 2. Open http://localhost:3000 in your browser
-- 3. Sign in (or use anonymous mode if available)
-- 4. For each prompt above:
--    a. Create a new conversation
--    b. Paste the prompt and send
--    c. Wait for the AI response
--    d. (Optional) Add 1-2 follow-up questions for more depth
-- 5. After creating all 30 conversations, run the search performance test

-- EXPECTED OUTCOME:
-- - 30 conversations with diverse topics
-- - Each conversation has 2-6 messages (initial prompt + response + follow-ups)
-- - Total: ~60-180 messages across various domains
-- - Topics cover: tech, business, health, AI, databases, APIs, security, etc.
-- - Good variety for testing search queries like:
--   * "database" (should match prompts 2, 12, 18, 21, 29)
--   * "API" (should match prompts 2, 5, 13, 22)
--   * "error" (should match prompts 4, 27)
--   * "authentication" (should match prompts 3, 19)

-- ============================================================================
-- AUTOMATION OPTION (Optional)
-- ============================================================================
-- If you want to automate this, you can create a script that calls your
-- /api/chat endpoint with these prompts. Let me know if you need help with that!
