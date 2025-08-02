const BotState = {
  JOINING_CALL: "joining_call",
  IN_WAITING_ROOM: "in_waiting_room",
  IN_CALL: "in_call",
  CALL_ENDED: "call_ended",
};

function toWebClient(url) {
  const m = url.match(/(https:\/\/[^/]+)\/j\/(\d+)\?(.*)$/);
  if (!m) return url; // already wc/join
  const [, host, id, query] = m;
  return `${host}/wc/join/${id}?${query}&prefer=1&browser=1`;
}

function buildLaunchOptions(headless) {
  const commonArgs = [
    "--window-size=1600,900",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--disable-dev-shm-usage",
  ];

  return headless
    ? {
        headless: true,
        args: ["--headless=new", ...commonArgs],
      }
    : {
        headless: false,
        args: commonArgs,
      };
}
function buildContextOptions(headless) {
  return headless
    ? {
        permissions: ["microphone", "camera"],
        recordVideo: {
          dir: "debug_videos/",
          size: { width: 1600, height: 900 },
        },
        viewport: null, // use window-size exactly
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/127.0.0.0 Safari/537.36", // match headed UA
      }
    : { permissions: ["microphone", "camera"] };
}

const findNewText = (oldText, newText) => {
  if (!oldText) return newText;
  if (newText === oldText) return "";

  // Case 1: Simple append (most common)
  if (newText.startsWith(oldText)) {
    return newText.substring(oldText.length).trim();
  }

  // Case 2: Find overlap where old text appears in new text (sliding window)
  // Look for the longest suffix of oldText that appears as a prefix in newText
  let bestOverlap = 0;
  let overlapStart = 0;

  // Try different overlap lengths, starting from the end of oldText
  for (let i = 1; i <= oldText.length; i++) {
    const suffix = oldText.substring(oldText.length - i);
    if (newText.startsWith(suffix)) {
      if (suffix.length > bestOverlap) {
        bestOverlap = suffix.length;
        overlapStart = oldText.length - i;
      }
    }
  }

  if (bestOverlap > 0) {
    // Found overlap - return only the new part after the overlap
    return newText.substring(bestOverlap).trim();
  }

  // Case 3: No overlap found - completely new text (speaker change, etc.)
  return newText;
};

module.exports = {
  buildLaunchOptions,
  buildContextOptions,
  BotState,
  toWebClient,
  findNewText,
};
