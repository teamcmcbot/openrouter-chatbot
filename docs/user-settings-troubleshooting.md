# User Settings Troubleshooting Guide

## Common Issues and Solutions

This guide helps resolve common problems with the User Settings panel and analytics functionality.

## Authentication Issues

### Problem: "Unauthorized" or "Invalid Token" Error

**Symptoms:**

- Settings panel shows authentication error
- Analytics data not loading
- Preference changes not saving

**Solutions:**

1. **Refresh Your Session**

   ```
   1. Sign out of your account
   2. Clear browser cache
   3. Sign back in with your credentials
   ```

2. **Check Browser Settings**

   - Ensure cookies are enabled
   - Disable ad blockers temporarily
   - Allow JavaScript execution

3. **Network Issues**
   - Check internet connection
   - Try accessing from a different network
   - Disable VPN if using one

**If Problem Persists:**
Contact support with your browser version and error message details.

---

## Data Loading Issues

### Problem: Analytics Data Not Displaying

**Symptoms:**

- Empty analytics section
- Zero values for all statistics
- Loading spinner never completes

**Solutions:**

1. **Manual Refresh**

   - Click the refresh icon in analytics section
   - Wait 30 seconds for data to load
   - Check if data appears

2. **Browser Troubleshooting**

   ```
   1. Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)
   2. Clear browser cache
   3. Disable browser extensions
   4. Try incognito/private mode
   ```

3. **Account Verification**
   - Ensure you've used the platform (sent messages)
   - Check if account is recently created (may take time to populate)
   - Verify subscription status

**Data Sync Timing:**

- Real-time data: Updates immediately
- Daily analytics: Updates every hour
- Historical data: May take up to 24 hours for new accounts

---

## Preferences Not Saving

### Problem: Settings Changes Don't Persist

**Symptoms:**

- Preferences revert to previous values
- "Save failed" error messages
- Changes not reflected in interface

**Solutions:**

1. **Validation Check**

   - Ensure temperature is between 0.0 and 2.0
   - Verify model selection is valid
   - Check system prompt is not empty and under 2000 characters

2. **Network Troubleshooting**

   ```
   1. Check internet connection stability
   2. Try saving one preference at a time
   3. Wait for save confirmation before making more changes
   ```

3. **Browser Compatibility**
   - Update to latest browser version
   - Disable conflicting extensions
   - Clear local storage and cookies

**Validation Rules Summary (System Prompt):**

- 1–2000 characters after trimming
- Blocks unsafe content (<script>, <iframe>, on\*=, javascript:, data:text/html)
- Blocks control characters (ASCII 0–8, 11–12, 14–31, 127)
- Blocks excessive whitespace (>50 spaces or >10 newlines in a row)

**What Happens on Error:**

- A red toast appears with the error message
  - For Toaster behavior and positioning details, see `docs/components/ui/Toaster.md`
- The value reverts to your last saved prompt
- Edit mode remains open so you can correct and retry

---

## Performance Issues

### Problem: Settings Panel Slow or Unresponsive

**Symptoms:**

- Long loading times
- UI freezing or lagging
- Delayed response to clicks

**Solutions:**

1. **Browser Optimization**

   ```
   1. Close unnecessary tabs
   2. Restart browser
   3. Clear cache and temporary files
   4. Disable heavy extensions
   ```

2. **System Resources**

   - Check available RAM
   - Close other applications
   - Restart computer if necessary

3. **Network Optimization**
   - Use wired connection if possible
   - Check network speed
   - Try different DNS servers

**Performance Tips:**

- Keep browser updated
- Use supported browsers (Chrome, Firefox, Safari, Edge)
- Avoid opening settings during peak usage times

---

## Subscription and Access Issues

### Problem: Models Not Available

**Symptoms:**

- Missing models in dropdown
- "Access denied" for certain models
- Limited model selection

**Solutions:**

1. **Subscription Verification**

   - Check current subscription tier
   - Verify payment status
   - Review usage limits

2. **Account Status**

   - Ensure account is in good standing
   - Check for any billing issues
   - Verify subscription renewal date

3. **Model Availability**
   - Some models may be temporarily unavailable
   - Check status page for service updates
   - Contact support for specific model access

**Tier Comparison:**

- **Free**: Basic models, limited usage
- **Pro**: Advanced models, higher limits
- **Enterprise**: All models, unlimited usage

---

## Error Messages and Meanings

### HTTP Error Codes

**401 Unauthorized**

- **Meaning**: Authentication failed
- **Solution**: Sign out and sign back in

**403 Forbidden**

- **Meaning**: Access denied for current subscription
- **Solution**: Upgrade subscription or contact support

**404 Not Found**

- **Meaning**: User profile not found
- **Solution**: Contact support to verify account status

**429 Too Many Requests**

- **Meaning**: Rate limit exceeded
- **Solution**: Wait and try again later

**500 Internal Server Error**

- **Meaning**: Server-side issue
- **Solution**: Try again later or contact support

### Application Error Messages

**"Failed to fetch user data"**

- Network connectivity issue
- Try refreshing or check internet connection

**"Validation failed"**

- Input data doesn't meet requirements
- Check and correct invalid values (see System Prompt rules above)

**"Database connection failed"**

- Temporary server issue
- Wait and try again

**"User not found"**

- Account verification issue
- Contact support immediately

---

## Browser-Specific Issues

### Chrome Issues

- Clear site data: Settings > Privacy > Site Settings
- Disable extensions one by one to identify conflicts
- Reset Chrome settings if necessary

### Firefox Issues

- Clear cookies and site data
- Disable tracking protection temporarily
- Check for Firefox updates

### Safari Issues

- Enable JavaScript and cookies
- Disable content blockers
- Clear website data

### Edge Issues

- Reset Edge browser
- Check compatibility mode settings
- Clear browsing data

---

## Mobile and Touch Device Issues

### Problem: Settings Panel Not Working on Mobile

**Common Issues:**

- Touch gestures not responding
- Zoom issues affecting interface
- Virtual keyboard covering inputs

**Solutions:**

1. **Mobile Optimization**

   - Use landscape orientation for better view
   - Zoom out to see full interface
   - Close virtual keyboard between inputs

2. **App vs Browser**

   - Try mobile browser instead of app
   - Clear mobile browser cache
   - Update browser app

3. **Touch Sensitivity**
   - Ensure screen is clean
   - Try different touch gestures
   - Restart device if unresponsive

---

## Data Discrepancy Issues

### Problem: Analytics Numbers Don't Match Expected Usage

**Potential Causes:**

1. **Time Zone Differences**

   - Analytics use UTC time
   - Your local time may differ
   - Check timestamp references

2. **Counting Methods**

   - Messages: Both sent and received count
   - Tokens: Include conversation context
   - Sessions: Only new conversations count

3. **Data Lag**
   - Real-time vs batch processing
   - Some metrics update hourly
   - Historical data may have delays

**Verification Steps:**

1. Compare with conversation history
2. Check timestamps on recent activity
3. Account for timezone differences
4. Contact support with specific discrepancies

---

## Advanced Troubleshooting

### Developer Tools Debugging

**Chrome/Edge DevTools:**

1. Press F12 to open DevTools
2. Go to Console tab
3. Look for error messages
4. Check Network tab for failed requests

**Firefox Developer Tools:**

1. Press F12 or right-click > Inspect
2. Check Console for errors
3. Monitor Network requests
4. Review Storage data

**Common Console Errors:**

- CORS errors: Browser security blocking requests
- 401/403 errors: Authentication/authorization issues
- Network errors: Connectivity problems
- JavaScript errors: Browser compatibility issues

### Network Debugging

**Check Request Details:**

1. Open Network tab in developer tools
2. Reproduce the issue
3. Look for failed requests (red entries)
4. Check request/response details

**Common Network Issues:**

- Slow response times (>5 seconds)
- Failed requests (status codes 4xx/5xx)
- CORS policy violations
- SSL certificate problems

### Local Storage Issues

**Clear Application Data:**

1. Open DevTools > Application tab
2. Expand Local Storage
3. Clear relevant domain data
4. Refresh and try again

**Session Storage:**

- Similar to local storage
- Clears when browser tab closes
- May contain temporary preference data

---

## Image Generation Issues

### Problem: Image Generation Toggle Not Available

**Symptoms:**

- Image generation toggle is missing or disabled
- "Upgrade required" message appears
- Cannot enable image generation in preferences

**Solutions:**

1. **Check Subscription Tier**

   ```
   Image generation requires Pro or Enterprise subscription
   - Anonymous/Free users: Feature not available
   - Pro users: 200 images/hour limit
   - Enterprise users: 500 images/hour limit
   ```

2. **Verify Model Compatibility**

   ```
   Ensure selected model supports image generation:
   - DALL-E models (recommended)
   - Other image-capable models listed
   - Check model description for image support
   ```

### Problem: Images Not Generating

**Symptoms:**

- Toggle is enabled but no images appear
- "Image generation failed" error messages
- Images appear as broken links

**Solutions:**

1. **Rate Limit Check**

   ```
   Monitor your usage:
   - Check analytics for current hour usage
   - Wait if you've hit tier limits
   - Consider upgrading to higher tier
   ```

2. **Model Selection**

   ```
   Switch to compatible models:
   - openai/dall-e-3 (recommended)
   - openai/dall-e-2
   - Verify model is available and not deprecated
   ```

3. **Content Policy**

   ```
   Ensure your prompts comply with policies:
   - Avoid requesting inappropriate content
   - Use descriptive, family-friendly language
   - Review OpenAI's usage policies
   ```

### Problem: High Image Generation Costs

**Symptoms:**

- Unexpected high costs in analytics
- Running out of credits quickly
- Cost alerts from the platform

**Solutions:**

1. **Monitor Usage**

   ```
   Track your image generation:
   - Check daily cost breakdown in settings
   - Set up usage alerts
   - Review image generation frequency
   ```

2. **Optimize Usage**

   ```
   Reduce costs by:
   - Being specific with image requests
   - Avoiding regeneration unless necessary
   - Using appropriate model tiers
   ```

### Problem: Generated Images Not Loading

**Symptoms:**

- Images show as broken or loading forever
- Signed URL expired errors
- Images worked previously but now fail

**Solutions:**

1. **Refresh Browser**

   ```
   Simple refresh often resolves:
   - Refresh the page
   - Clear browser cache
   - Try in incognito/private mode
   ```

2. **Check Network**

   ```
   Verify connectivity:
   - Test other images load correctly
   - Check if behind corporate firewall
   - Try different network connection
   ```

3. **Storage Issues**

   ```
   If problems persist:
   - Images may be archived due to retention policies
   - Check your tier's storage limits
   - Contact support for recovery options
   ```

---

## When to Contact Support

### Immediate Support Needed:

- Account access completely blocked
- Billing or subscription issues
- Data loss or corruption
- Security concerns

### General Support:

- Persistent technical issues
- Feature requests
- Usage questions
- Feedback and suggestions

### Support Information to Provide:

1. **Account Details**

   - Email address
   - Subscription tier
   - Account creation date

2. **Technical Information**

   - Browser and version
   - Operating system
   - Error messages (screenshots helpful)
   - Steps to reproduce issue

3. **Context**
   - When issue started
   - What you were trying to do
   - Any recent changes to account/settings

### Support Channels:

- **Email**: [Support Email]
- **Help Center**: [Help Center URL]
- **Live Chat**: Available during business hours
- **Community Forum**: User-to-user help

---

## Prevention Tips

### Avoid Common Issues:

1. **Regular Maintenance**

   - Clear browser cache monthly
   - Update browser regularly
   - Review settings periodically

2. **Best Practices**

   - Save preferences individually
   - Verify changes before closing settings
   - Keep subscription current

3. **Monitoring**
   - Check analytics regularly
   - Monitor usage against limits
   - Watch for unusual patterns

### Backup and Recovery:

- Export usage data regularly
- Note down custom preferences
- Keep subscription information handy
- Document any custom configurations

## Changelog

- 2025-08-08: Added troubleshooting for System Prompt validation and save failures.

This troubleshooting guide should help resolve most common issues. For problems not covered here, don't hesitate to contact our support team with detailed information about your issue.
