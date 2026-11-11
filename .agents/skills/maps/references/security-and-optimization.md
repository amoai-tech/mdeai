---
title: Maps Platform — API key security + HTML pages + optimization
---

# Maps Platform — Security, HTML Pages & Optimization

Official: https://developers.google.com/maps/api-security-best-practices
Optimization: https://developers.google.com/maps/optimization-guide
Coverage: https://developers.google.com/maps/coverage

---

## API key architecture — three deployment modes

### Mode 1: Personal / CLI use

API key in `.env`, used locally. Key never leaves the machine.

```
.env (GOOGLE_MAPS_API_KEY=...)
gmaps.py → calls Google APIs directly
HTML pages → supported Maps Embed API with a restricted browser key, or Maps URLs for keyless outbound links
```

**Risk:** Low — it's the user's own key on their own machine.
**Best practice:** Use the supported Maps Embed API for simple iframe maps and Maps JavaScript API for richer interactive behavior. Use Maps URLs when the requirement is a keyless outbound link rather than an embedded map.

### Mode 2: Users bring their own key (BYOK)

Users configure their own Google API key. They control their own billing.

- Store key in user profile (encrypted at rest)
- Use server-side for data queries
- For portable/shareable HTML, prefer Google Maps URLs instead of embedding a user-specific key
- Never put a server key or unrestricted browser key in a downloadable file

### Mode 3: Platform key — you pay, users must never see it

You provide the Google API key. Architecture requires two separate keys.

```
Browser
├─ Interactive map rendering ← Frontend Key (HTTP referrer restricted)
└─ All data (weather, places, directions)
     ↑ pre-rendered from backend — NO API key in browser

Your Backend Server
├─ Backend Key (env var, IP restricted — never sent to browser)
├─ Geocoding, Directions, Places, Weather, etc.
└─ All data APIs proxied server-side
```

**Frontend key** (client-side, in the HTML):
- Enables: **Maps JavaScript API**; also enable **Places API (New)** on this browser key when the app uses browser Places New search/autocomplete
- Restricted by: **HTTP referrer** → `https://app.yourdomain.com/*`
- If copied by someone: only works from your domain, useless elsewhere

**Backend key** (server-side, hidden):
- Enables: all data APIs (geocoding, directions, places, weather, etc.)
- Restricted by: **Server IP address**
- Never sent to the browser

---

## Setting up two keys in GCP Console

### Frontend key

1. **APIs & Services → Credentials → Create Credentials → API Key**
2. Edit key → Application restrictions: **HTTP referrers**
3. Add: `https://app.yourdomain.com/*`
4. API restrictions: **Restrict key** → enable **Maps JavaScript API**; add **Places API (New)** only when the browser uses Places New search/autocomplete
5. Save

### Backend key

1. Create another API key
2. Application restrictions: **IP addresses** → add your server IP(s)
3. API restrictions: enable all data APIs you use:
   - Geocoding, Routes, Places (New), Weather, Air Quality, Pollen
   - Solar, Elevation, Time Zone, Address Validation, Roads
   - Street View Static, Geolocation, Aerial View, Route Optimization
4. Save

```bash
# Your server environment
GOOGLE_MAPS_BACKEND_KEY=AIzaSy...xxx   # IP-restricted, server only
GOOGLE_MAPS_FRONTEND_KEY=AIzaSy...yyy  # Domain-restricted, in HTML
```

---

## HTML pages — supported embed path

Use the documented **Maps Embed API** when an iframe is required. It uses the `https://www.google.com/maps/embed/v1/` endpoint and requires an API key. Restrict the browser key to approved HTTP referrers and only the APIs the page needs.

```html
<iframe
  width="600"
  height="450"
  style="border:0"
  loading="lazy"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
  src="https://www.google.com/maps/embed/v1/place?key=YOUR_RESTRICTED_BROWSER_KEY&q=El+Poblado+Medellin">
</iframe>
```

For directions, search, view, or Street View embeds, use the documented Embed API mode and current parameters:
https://developers.google.com/maps/documentation/embed/embedding-map

For a **keyless link** that opens Google Maps instead of embedding it, use Maps URLs:
https://developers.google.com/maps/documentation/urls/get-started

Use Maps JavaScript API when the product needs richer interactive behavior such as application-managed markers, clustering, route rendering, or synchronized React state.

---

## Street View — link or supported embed

For a keyless outbound experience, use an official Google Maps URL:

```
https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lng}&heading={heading}&pitch=0&fov=90
```

If Street View must be embedded on the page, use the documented Maps Embed API `streetview` mode with a properly restricted browser key. Do not treat a browser key as a secret; protect it with application and API restrictions.

```html
<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=6.2088,-75.5736&heading=90&pitch=0&fov=90"
   target="_blank" rel="noopener noreferrer">
  Open Street View →
</a>
```

Prefer the documented `api=1` Maps URL syntax over undocumented URL shorthand.

---

## Shareable export mode — no keys in downloadable HTML

When users want to download or share HTML pages:

| Element | In-app (interactive) | Shareable export |
|---------|---------------------|-----------------|
| Maps | Maps JS API or Maps Embed API with restricted browser key | Google Maps URL link when the export must remain keyless |
| Street View | Maps URL link or supported Embed API | Google Maps URL link when the export must remain keyless |
| Route lines | Current Routes/Route APIs (restricted key) | Static map image with path overlay |
| Data (weather, places) | Pre-rendered from backend | Same pre-rendered HTML — no API calls |

```bash
# Generate a supported Maps Embed API URL (requires a configured restricted key)
python3 ~/.claude/skills/maps/scripts/gmaps.py embed-url --mode place --query "El Poblado Medellín"
python3 ~/.claude/skills/maps/scripts/gmaps.py embed-url --mode directions --origin "Aeropuerto Medellín" --destination "El Poblado"
```

---

## Rate limiting and abuse prevention (platform mode)

When serving multiple users with your key:
- **Per-user rate limits** — cap API calls per user per hour/day
- **Authentication** — only authenticated users can trigger API calls
- **Usage tracking** — log which user triggered which call
- **Quota alerts** — GCP billing alerts for unexpected spikes
- **Budget caps** — maximum daily spend in GCP Console

---

## Performance optimization

From https://developers.google.com/maps/optimization-guide:

### Reduce API calls
- Send requests **only on user interaction** — never proactively
- **Cache results** where permitted (geocoded addresses, place details)
- Use **exponential backoff** on quota errors (double wait time each retry)

### Map rendering performance
- Use **raster markers** (PNG/JPG) not SVG — lower rendering overhead
- Enable **marker optimization** for large marker sets (renders as one static element)
- Use **Marker Clusterer library** for 100+ markers
- Keep intensive operations (large queries, DOM manipulation) out of `Draw()` callbacks
- Avoid overlay redraws during map pan/zoom

### Billing optimization
- Request only the **field mask** fields the feature actually needs.
- When you already have a place ID, choose the smallest current Place Details field set rather than issuing an unnecessary search.
- Use the current provider-recommended autocomplete session-token flow; billing semantics are version/SKU sensitive.
- Before claiming one API/field is cheaper or free, verify the current Google Maps pricing/SKU documentation.

### Set budget alerts
```
GCP Console → Billing → Budgets & Alerts
```
Choose alert thresholds appropriate to the project. Budget alerts are notifications, not an automatic hard cap; enforce application quotas or a kill switch separately when a hard stop is required.

---

## Coverage

Coverage, supported languages, regional availability, preview/GA status, and AI-generated Place fields change over time. Do not freeze regional claims in this skill. Verify the exact product/field at use time:

- Coverage: https://developers.google.com/maps/coverage
- Places summaries: https://developers.google.com/maps/documentation/places/web-service/place-summaries

For MDE international flows, treat unavailable provider fields as optional and degrade gracefully without inventing replacement provider data.

---

## Error types and responses

| Error | Meaning | Fix |
|-------|---------|-----|
| `403 Forbidden` / `REQUEST_DENIED` | API not enabled or key restricted | Enable API in GCP Console; check key restrictions |
| `400 Bad Request` | Invalid parameters | Check API docs for required fields |
| `429 Rate Limited` | Quota exceeded | Exponential backoff; check daily limits |
| `ZERO_RESULTS` | No results found | Broaden query or expand radius |
| `RefererNotAllowedMapError` | HTTP referrer restriction mismatch | Add current origin to key's referrer list |
| Key not found | `GOOGLE_MAPS_API_KEY` not set | Check `.env` or environment variables |

When a command fails with `403` or `REQUEST_DENIED`: **stop and tell the user**. Do not silently fall back to web search. Offer to navigate to GCP Console to enable the API.

**GCP API library URL pattern:**
```
https://console.cloud.google.com/apis/library/{api-endpoint}
```

| API | Endpoint |
|-----|---------|
| Places (New) | `places-backend.googleapis.com` |
| Geocoding | `geocoding-backend.googleapis.com` |
| Routes | `routes-backend.googleapis.com` |
| Maps JavaScript | `maps-backend.googleapis.com` |
| Weather | `weather.googleapis.com` |
| Air Quality | `airquality.googleapis.com` |

---

## Pricing and quotas

Do not hard-code Maps pricing, credits, quota limits, or SKU assumptions in this skill. Verify current official pricing and product-specific usage/billing documentation at decision time:

- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/embed/usage-and-billing

Record the source/date in implementation or PR evidence when cost materially affects architecture.
