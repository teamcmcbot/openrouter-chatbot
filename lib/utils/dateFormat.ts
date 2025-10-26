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
 * Formats a timestamp for conversation list display (relative/absolute time)
 * - Shows "just now" for < 1 minute
 * - Shows "X mins ago" for < 60 minutes
 * - Shows "X hours ago" for < 24 hours
 * - Shows "DD-MMM-YYYY HH:mm" for ≥ 24 hours (local browser time)
 * - Returns "-" for missing or invalid timestamps
 */
export function formatConversationTimestamp(timestamp: string): string {
  // Handle missing or invalid timestamps
  if (!timestamp || timestamp.trim() === "") {
    return "-";
  }
  
  const date = new Date(timestamp);
  
  // Check if date is invalid
  if (isNaN(date.getTime())) {
    return "-";
  }
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  // Handle future timestamps (clock skew)
  if (diffMs < 0) {
    return "just now";
  }
  
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  
  if (diffMs < MINUTE) {
    // Less than 1 minute
    return "just now";
  } else if (diffMs < HOUR) {
    // 1-59 minutes
    const mins = Math.floor(diffMs / MINUTE);
    return mins === 1 ? "1 min ago" : `${mins} mins ago`;
  } else if (diffMs < DAY) {
    // 1-23 hours
    const hours = Math.floor(diffMs / HOUR);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  } else {
    // 24+ hours: DD-MMM-YYYY HH:mm (local browser time)
    const day = String(date.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  }
}
