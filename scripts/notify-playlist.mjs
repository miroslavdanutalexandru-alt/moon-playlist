import { readFile, writeFile } from "node:fs/promises";

const playlistId = process.env.YOUTUBE_PLAYLIST_ID || "PLApqyIlpej2o";
const statePath = process.env.PLAYLIST_STATE_PATH || "data/playlist-state.json";
const dryRun = process.env.DRY_RUN === "1";

const requiredForSend = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TO_NUMBER",
];

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
  const response = await fetch(feedUrl);

  if (!response.ok) {
    throw new Error(`YouTube feed returned ${response.status}`);
  }

  return parseFeed(await response.text());
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

    const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`YouTube Data API returned ${response.status}: ${body}`);
    }

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

  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function buildMessage(video) {
  return [
    "A new song was added to A Song for Every Facet of My Moon.",
    "",
    video.title,
    video.link,
  ].join("\n");
}

function buildWhatsAppPayload(video) {
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  if (!templateName) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: process.env.WHATSAPP_TO_NUMBER,
      type: "text",
      text: {
        preview_url: true,
        body: buildMessage(video),
      },
    };
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: process.env.WHATSAPP_TO_NUMBER,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US",
      },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: video.title },
            { type: "text", text: video.link },
          ],
        },
      ],
    },
  };
}

async function sendWhatsApp(video) {
  const missing = requiredForSend.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required WhatsApp env vars: ${missing.join(", ")}`);
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const endpoint = `https://graph.facebook.com/${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildWhatsAppPayload(video)),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp API returned ${response.status}: ${body}`);
  }
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
  await saveState(videos.map((video) => video.videoId));
  process.exit(0);
}

if (newVideos.length === 0) {
  console.log("No new playlist videos found.");
  await saveState(videos.map((video) => video.videoId));
  process.exit(0);
}

for (const video of newVideos) {
  if (dryRun) {
    console.log(`[dry run] Would send WhatsApp notification for: ${video.title}`);
  } else {
    await sendWhatsApp(video);
    console.log(`Sent WhatsApp notification for: ${video.title}`);
  }
}

await saveState(videos.map((video) => video.videoId));
