// lib/utils/dateFormat.ts

/**
 * Formats a date/timestamp for message display
 * - Shows only time (HH:MM) for messages from today
 * - Shows date + time (dd-mm-yyyy HH:MM) for older messages
 */
export function formatMessageTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  
  // Check if the message is from today
  const isToday = messageDate.getTime() === today.getTime();
  
  if (isToday) {
    // Show only time for today's messages
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    // Show date and time for older messages
    return dateObj.toLocaleDateString([], { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    }) + ' ' + dateObj.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
}

/**
 * Formats a timestamp for conversation list display (relative time)
 * - Shows "Today", "Yesterday", "X days ago", or full date
 */
export function formatConversationTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}
