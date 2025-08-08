# User Settings Guide

## Overview

The User Settings panel provides comprehensive control over your account preferences, displays usage analytics, and shows your profile information. This guide explains all available features and how to use them effectively.

## Accessing User Settings

You can open the User Settings panel by:

1. **From Chat Sidebar**: Click the settings/profile icon in the sidebar
2. **From Navigation**: Use the settings option in the main navigation menu
3. **Keyboard Shortcut**: (If implemented) Use the designated keyboard shortcut

## Settings Sections

### 1. Profile Information

Your profile section displays essential account information:

- **Email Address**: Your registered email (from Google OAuth)
- **Full Name**: Your display name from your OAuth account
- **Avatar**: Your profile picture from your OAuth provider
- **Subscription Tier**: Your current plan (Free, Pro, or Enterprise)
- **Credits**: Available credits for premium features

**Note**: Profile information is automatically synced from your OAuth provider and cannot be edited directly through the settings panel.

### 2. Usage Analytics

View real-time statistics about your platform usage:

#### Today's Activity

- **Messages Sent**: Number of messages you've sent today
- **Tokens Used**: Total tokens consumed today across all conversations
- **Sessions Created**: Number of new chat sessions started today
- **Active Minutes**: Time spent actively using the platform today

#### All-Time Statistics

- **Total Messages**: Cumulative message count since account creation
- **Total Tokens**: All-time token usage across all conversations
- **Total Sessions**: Number of chat sessions created since joining
- **Account Created**: When your account was first created

#### Refresh Analytics

Use the refresh icon to manually update your analytics data and see the latest usage statistics.

### 3. User Preferences

Customize your experience with these preference categories:

#### UI Preferences

- **Theme**: Choose between light and dark themes
- **Language**: Set your preferred interface language
- **Display Options**: Various UI customization options

#### Session Preferences

- **Auto-save**: Automatically save conversation history
- **History Limit**: Maximum number of messages to keep in session history
- **Session Management**: How the app handles multiple sessions

#### Model Settings

- **Default Model**: Your preferred AI model for new conversations
  - Select from available models based on your subscription tier
  - Choose "None" to let the system select the best available model for each conversation
  - If your current default model becomes unavailable, it will be marked with "(Not available)"
- **Temperature**: Controls randomness in AI responses (0.0 = focused, 2.0 = creative)
- **System Prompt**: Default instructions given to the AI model
  - Inline editor appears under Temperature when you click "Edit"
  - 2000-character limit with real-time counter and word count
  - Visual indicators: ✓ valid, ⚠️ 90% capacity, 🚫 at max length
  - Inline validation messages and accessible aria attributes
  - Save is disabled when invalid or empty; input is trimmed before save

##### System Prompt Preview

When not in edit mode, a preview shows the beginning of your system prompt using word-boundary truncation (~200 chars) for readability.

##### Editing and Saving

1. Click "Edit" in Preferences
2. Modify the System Prompt in the textarea
3. Watch the character counter and validation indicators
4. Click "Save" to persist changes
   - Success: green toast, preview updates, edit mode closes
   - Failure: red toast, value reverts to last known good, stays in edit mode

##### Validation Rules

- 1–2000 characters after trimming
- Rejects unsafe content:
  - HTML/script patterns: <script>, <iframe>, <object>, <embed>, on\*=, javascript:, data:text/html
  - Control characters: ASCII 0–8, 11–12, 14–31, 127
  - Excessive whitespace: >50 consecutive spaces or >10 consecutive newlines

##### Accessibility

- Textarea uses `aria-invalid` and `aria-describedby` for errors/help
- Keyboard accessible controls and clear focus styles

##### Tips for Effective Prompts

- Be specific about tone, role, and style
- Include constraints (formatting, brevity, citation rules)
- Keep it concise; long prompts may reduce response efficiency

### 4. Available Models

See which AI models you can access based on your subscription tier:

- **Model List**: All models available to your account
- **Usage Limits**: Daily and monthly limits for each model
- **Model Information**: Descriptions and capabilities of each model
- **Access Level**: Whether models are available with your current subscription

## Understanding Analytics Data

### What Counts as a Message?

- Each text you send to the AI counts as one message
- AI responses also count toward your message total
- System messages and errors are not counted

### Token Usage Explained

- **Tokens**: Units of text that AI models process (roughly 1 token = 0.75 words)
- **Input Tokens**: Tokens from your messages and conversation context
- **Output Tokens**: Tokens generated by the AI in responses
- **Total Tokens**: Sum of input and output tokens

### Session Tracking

- **Session**: A continuous conversation thread
- **New sessions** are created when you start a fresh conversation
- **Active minutes** track time spent actually interacting (not idle time)

## Customizing Your Experience

### Choosing the Right Model

- **Free Tier**: Access to basic models with usage limits
- **Pro Tier**: Access to advanced models with higher limits
- **Enterprise**: Unlimited access to all available models

### Default Model Management

The default model setting determines which AI model is automatically selected for new conversations. You have several options:

#### Setting Your Default Model

1. **Specific Model**: Choose a particular model that will be used for all new conversations

   - Best for consistent experience with a preferred model
   - Ensures predictable behavior across sessions
   - May become unavailable if your subscription changes or model is deprecated

2. **None (Automatic Selection)**: Let the system choose the best available model
   - System selects optimal model based on your tier and availability
   - Automatically adapts when new models are added or removed
   - Recommended for users who want the latest and best available options

#### Handling Model Availability

- **Available Models**: Models shown in dropdown are accessible with your current subscription
- **Unavailable Default**: If your current default model is no longer available, it will display with "(Not available)" indicator
- **Model Transitions**: When models are deprecated or subscription changes, you can easily switch to "None" or select a new specific model

#### Best Practices

- **Regular Review**: Periodically check if your default model is still available and suitable
- **Tier Changes**: When upgrading/downgrading subscription, review and update your default model
- **New Features**: Consider switching to "None" to automatically benefit from newly released models
- **Backup Plan**: If you prefer a specific model, have a backup choice in mind

### Optimizing Temperature Settings

- **0.0 - 0.3**: Highly focused, deterministic responses (good for factual questions)
- **0.4 - 0.7**: Balanced creativity and focus (recommended for most uses)
- **0.8 - 1.2**: More creative and varied responses
- **1.3 - 2.0**: Maximum creativity (may be less consistent)

### Effective System Prompts

- Keep prompts clear and specific
- Define the AI's role (e.g., "You are a helpful coding assistant")
- Include any special instructions or constraints
- Avoid overly long or complex prompts

## Subscription Tiers & Features

### Free Tier

- ✅ Basic AI models
- ✅ Limited daily message quota
- ✅ Standard features
- ✅ Basic analytics

### Pro Tier

- ✅ All Free tier features
- ✅ Advanced AI models
- ✅ Higher usage limits
- ✅ Priority support
- ✅ Enhanced analytics

### Enterprise Tier

- ✅ All Pro tier features
- ✅ Unlimited usage
- ✅ Custom models
- ✅ Team management
- ✅ Advanced security features

## Privacy & Data Management

### Data Collection

- **Usage Statistics**: We track message counts and token usage for billing and analytics
- **Conversation History**: Stored securely and only accessible to you
- **Preferences**: Saved to provide a consistent experience across sessions

### Data Control

- **Export**: Download your usage data and conversation history
- **Privacy**: Your conversations are private and not used for training AI models
- **Deletion**: Contact support for account deletion requests

## Troubleshooting

### Settings Not Saving

1. Check your internet connection
2. Refresh the page and try again
3. Clear browser cache if problems persist
4. Contact support if issues continue

### Analytics Not Updating

1. Use the refresh button in the analytics section
2. Check if you're signed in properly
3. Wait a few minutes for data to sync
4. Contact support if data appears incorrect

### Model Access Issues

1. Verify your subscription tier
2. Check if you've exceeded usage limits
3. Try refreshing your browser
4. Contact support for billing issues

### Default Model Problems

1. **Model Shows "(Not available)"**:

   - Your saved default model is no longer accessible
   - Select a new model from the available options or choose "None"
   - Contact support if you believe this is an error

2. **"None" Option Not Working**:

   - Refresh the settings page
   - Clear browser cache
   - Verify you're signed in properly
   - Contact support if the issue persists

3. **Changes Not Saving**:
   - Check your internet connection
   - Ensure you clicked "Save Changes" button
   - Try selecting "None" first, save, then select your preferred model
   - Clear browser cache and try again

### Performance Issues

1. Close unnecessary browser tabs
2. Clear browser cache and cookies
3. Disable browser extensions temporarily
4. Try using a different browser

## Getting Help

### Support Resources

- **Documentation**: Comprehensive guides and tutorials
- **FAQ**: Common questions and answers
- **Community**: User forums and discussion groups
- **Support Tickets**: Direct assistance from our team

### Contact Information

- **Email Support**: [Support Email]
- **Live Chat**: Available during business hours
- **Status Page**: Check for service outages or maintenance
- **Social Media**: Follow us for updates and announcements

### Feedback

We value your feedback! Help us improve by:

- Reporting bugs or issues
- Suggesting new features
- Sharing your user experience
- Participating in user surveys

## Tips for Best Experience

### Optimize Your Usage

- **Monitor Limits**: Keep track of your daily/monthly usage
- **Choose Appropriate Models**: Use simpler models for basic tasks
- **Manage Sessions**: Close unused sessions to improve performance
- **Regular Updates**: Keep your preferences up to date

### Maximize Productivity

- **Consistent Prompts**: Develop effective system prompts for your use cases
- **Model Selection**: Learn which models work best for different tasks
- **Session Organization**: Use descriptive titles for better organization
- **Preference Sync**: Set up preferences once and enjoy consistent experience

### Security Best Practices

- **Regular Reviews**: Periodically review your usage and settings
- **Strong Passwords**: Use secure authentication methods
- **Privacy Awareness**: Understand what data is collected and how it's used
- **Session Security**: Log out from shared or public computers

## Changelog

- 2025-08-08: Added System Prompt editor documentation (limits, validation, UX) and preview behavior.

This guide covers all aspects of the User Settings panel. For additional help or questions not covered here, please contact our support team.
