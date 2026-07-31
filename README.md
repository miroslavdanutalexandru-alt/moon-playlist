# A Song for Every Facet of My Moon

A static GitHub Pages site that links to a YouTube playlist and includes ntfy and WhatsApp opt-in links. The repository also contains a scheduled GitHub Actions workflow that checks the playlist feed and sends a notification when a new song appears.

## Files

- `index.html`, `styles.css`, `script.js`: the GitHub Pages site.
- `config.js`: public website configuration for the ntfy topic.
- `scripts/notify-playlist.mjs`: scheduled playlist checker and notification sender.
- `.github/workflows/playlist-notifier.yml`: runs the checker twice per hour.
- `data/playlist-state.json`: committed playlist state used to detect new videos.

## Website setup

1. Edit `config.js`.
2. Set `whatsappNumber` to your WhatsApp Business sender number, including country code and digits only.
3. Push this folder to a GitHub repository.
4. In GitHub, open `Settings > Pages`.
5. Set the source to deploy from the main branch root.

The playlist button points to:

```text
https://www.youtube.com/watch?v=jSelxexU9Lg&list=PLApqyIlpej2o
```

## ntfy notifications

The site has a button that opens the ntfy subscription page for this topic:

```text
moon-playlist-7bb3596cd0321a2a662ceceb
```

On Android, iPhone, or desktop, install/open ntfy and subscribe to that topic. GitHub Actions publishes new-song notifications there automatically.

ntfy topics are public if they are not reserved or protected. This topic is intentionally hard to guess, but anyone who knows it can subscribe or publish to it. For private notifications, reserve/protect the topic in ntfy or self-host ntfy with authentication.

## Optional WhatsApp notification setup

GitHub Pages cannot send WhatsApp messages by itself. True automatic WhatsApp notifications require WhatsApp Business Platform credentials.

Create these repository secrets in `Settings > Secrets and variables > Actions`:

- `YOUTUBE_API_KEY`: YouTube Data API key. This is needed for this playlist because the public RSS feed currently returns 404.
- `WHATSAPP_ACCESS_TOKEN`: permanent or long-lived WhatsApp Cloud API token.
- `WHATSAPP_PHONE_NUMBER_ID`: the sender phone number ID from Meta.
- `WHATSAPP_TO_NUMBER`: recipient number in international format, digits only.
- `WHATSAPP_API_VERSION`: optional. Defaults to `v23.0` if omitted.
- `WHATSAPP_TEMPLATE_NAME`: recommended for real automatic alerts. Use an approved template with two body variables: song title and song link.
- `WHATSAPP_TEMPLATE_LANGUAGE`: optional. Defaults to `en_US`.

The recipient must opt in before receiving messages. The site's WhatsApp button opens a pre-filled opt-in message.

WhatsApp allows free-form text replies only inside the 24-hour customer service window after the recipient messages the business. Outside that window, use `WHATSAPP_TEMPLATE_NAME` with an approved template.

## First run behavior

The first run initializes `data/playlist-state.json` and does not send notifications for existing songs. Later runs notify only for newly added videos.

To test locally without sending WhatsApp:

```powershell
$env:DRY_RUN = "1"
node scripts/notify-playlist.mjs
```
