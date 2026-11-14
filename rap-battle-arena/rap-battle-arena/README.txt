Rap Battle Arena - Einrichtung (nur Client-ID, kein Secret)
1. dev.twitch.tv/console: App Client-Typ = Oeffentlich,
   OAuth Redirect URL = https://DEINSITE.netlify.app/  (mit / am Ende)
2. Netlify > Site configuration > Environment variables:
   TWITCH_CLIENT_ID = deine Client-ID. Danach neu deployen.
3. Deploy ueber GitHub (Import from Git). Drag&Drop deployt keine Functions.
