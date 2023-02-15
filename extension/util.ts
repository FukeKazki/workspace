export const API_BASE = "http://localhost:9281/" as const;
/**
 * 通知を表示する
 */
export function createNotification(title: string, message: string) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "/icon.png",
    title: title,
    message: message,
    priority: 1,
  });
}
