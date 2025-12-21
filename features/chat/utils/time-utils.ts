/**
 * Utility functions for formatting timestamps
 */

/**
 * Formats a timestamp for display in chat messages
 * Shows time for today, date+time for older messages
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string
 *
 * @example
 * formatTimestamp(Date.now())
 * // returns "2:34 PM"
 *
 * formatTimestamp(Date.now() - 86400000)
 * // returns "Dec 19, 2:34 PM"
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${dateStr}, ${timeStr}`;
}
