import { readFile, rename, writeFile } from "node:fs/promises";

const playlistId = process.env.YOUTUBE_PLAYLIST_ID || "PLApqyIlpej2o";
const statePath = process.env.PLAYLIST_STATE_PATH || "data/playlist-state.json";
const dryRun = process.env.DRY_RUN === "1";
const requestTimeoutMs = 15_000;
const maxAttempts = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, label = "request") {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) return response;

      const body = await response.text();
      const retryable = response.status === 408 || response.status === 425 ||
        response.status === 429 || response.status >= 500;
      lastError = new Error(`${label} returned ${response.status}: ${body.slice(0, 300)}`);
      lastError.retryable = retryable;
      if (!retryable || attempt === maxAttempts) throw lastError;
    } catch (error) {
      clearTimeout(timeout);
      if (error.retryable === false) throw error;
      lastError = error.name === "AbortError"
        ? new Error(`${label} timed out after ${requestTimeoutMs}ms`)
        : error;
      if (attempt === maxAttempts) throw lastError;
    }

    await sleep(500 * 2 ** (attempt - 1));
  }

  throw lastError;
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function parseFeed(xml) {
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
  return entries.map((entry) => {
    const videoId = tagValue(entry, "yt:videoId");
    const title = tagValue(entry, "title");
    const publishedAt = tagValue(entry, "published");
    const link = `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`;

    return { videoId, title, publishedAt, link };
  }).filter((video) => video.videoId);
}

async function fetchFromFeed() {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
  const response = await fetchWithRetry(feedUrl, {}, "YouTube feed");
  const videos = parseFeed(await response.text());
  if (videos.length === 0) throw new Error("YouTube feed returned no videos");
  return videos;
}

async function fetchFromDataApi() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required because the public playlist feed is unavailable.");
  }

  const videos = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      part: "snippet",
      maxResults: "50",
      playlistId,
      key: apiKey,
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetchWithRetry(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
      {},
      "YouTube Data API",
    );
    const payload = await response.json();
    for (const item of payload.items || []) {
      const snippet = item.snippet || {};
      const videoId = snippet.resourceId?.videoId;
      if (!videoId) continue;

      videos.push({
        videoId,
        title: snippet.title || "Untitled YouTube video",
        publishedAt: snippet.publishedAt || "",
        link: `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`,
      });
    }

    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return videos;
}

async function loadState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return { initialized: false, videoIds: [], lastCheckedAt: null };
  }
}

async function saveState(videoIds) {
  const state = {
    initialized: true,
    videoIds,
    lastCheckedAt: new Date().toISOString(),
  };

  const tempPath = `${statePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tempPath, statePath);
}

async function sendNtfy(video) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    return false;
  }

  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const response = await fetchWithRetry(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Title": "New moon playlist song",
      "X-Tags": "musical_note,sparkles",
      "X-Click": video.link,
    },
    body: `${video.title}\n${video.link}`,
  });

  return true;
}

let videos;
try {
  videos = await fetchFromFeed();
} catch (error) {
  console.log(`${error.message}. Trying YouTube Data API fallback.`);
  videos = await fetchFromDataApi();
}

if (videos.length === 0) {
  throw new Error("No playlist videos found.");
}

const state = await loadState();
const knownIds = new Set(state.videoIds || []);
const newVideos = videos.filter((video) => !knownIds.has(video.videoId)).reverse();

if (!state.initialized) {
  console.log(`Initialized playlist state with ${videos.length} videos. No messages sent.`);
  if (!dryRun) await saveState(videos.map((video) => video.videoId));
  process.exit(0);
}

if (newVideos.length === 0) {
  console.log("No new playlist videos found.");
  if (!dryRun) await saveState(videos.map((video) => video.videoId));
  process.exit(0);
}

const processedIds = new Set(knownIds);
for (const video of newVideos) {
  if (dryRun) {
    console.log(`[dry run] Would send notification for: ${video.title}`);
  } else {
    if (!process.env.NTFY_TOPIC) throw new Error("NTFY_TOPIC is not configured.");
    await sendNtfy(video);
    processedIds.add(video.videoId);
    await saveState([...processedIds]);
    console.log(`Sent notification for: ${video.title}`);
  }
}

if (!dryRun) await saveState(videos.map((video) => video.videoId));
