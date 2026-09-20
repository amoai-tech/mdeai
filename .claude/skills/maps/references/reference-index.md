# Google Maps reference index

Use this index to choose the smallest authoritative source for a Maps task. Score = MDE reference priority (10 = primary/current implementation authority; lower scores = discovery/community only). Volatile facts such as pricing, quotas, preview/GA status, regional coverage, and limits must be rechecked at use time.

## 1. Core Google Maps Platform

| Reference | Authority | Use case | Real-world example | Score |
|---|---|---|---|---:|
| [Documentation](https://developers.google.com/maps/documentation) | Google official docs | Product/API entry point | Choose Maps vs Routes vs Places for a property-search feature | 10/10 |
| [Developer home](https://developers.google.com/maps) | Google official docs | Platform overview + navigation | Find the current JS/Places/Routes docs before implementation | 10/10 |
| [Get started](https://developers.google.com/maps/get-started) | Google official docs | Project, API key, billing setup | Create restricted credentials for a production MDE map | 10/10 |
| [APIs by platform](https://developers.google.com/maps/apis-by-platform) | Google official docs | Web/Android/iOS capability selection | Verify a feature exists on Web before designing it | 10/10 |
| [Architecture Center](https://developers.google.com/maps/architecture) | Google official architecture | Production architecture patterns | Design server/client boundaries for Places + Maps JS | 10/10 |
| [Capabilities Explorer](https://developers.google.com/maps/documentation/capabilities-explorer) | Google official docs | Compare capabilities/products | Decide whether Places, Routes, or Address Validation fits a workflow | 10/10 |
| [Maps APIs product page](https://mapsplatform.google.com/lp/maps-apis/) | Google product page | Product/pricing orientation | Understand modern products and legacy-service notices | 8/10 |
| [Maps Platform](https://mapsplatform.google.com/) | Google product page | Product discovery | Explore Maps, Routes, Places, Environment and AI offerings | 8/10 |
| [Dynamic Maps](https://mapsplatform.google.com/maps-products/dynamic-maps/) | Google product page | Interactive map capabilities | Build an interactive rentals map with styled markers | 8/10 |
| [Maps products / Static Maps](https://mapsplatform.google.com/maps-products/#static-maps) | Google product page | Static-map discovery | Generate non-interactive listing/location images | 8/10 |
| [Maps Demo Key](https://mapsplatform.google.com/maps-demo-key/) | Google official product page | Zero-friction prototype setup | Prototype a map before creating production credentials | 9/10 |
| [Premium included APIs](https://cloud.google.com/maps-platform/terms/other/premium-included-apis?hl=es) | Google Cloud terms/reference | Legacy Premium Plan compatibility only | Audit an old Premium Plan integration | 6/10 |

## 2. Places, AI, grounding, and agent development

| Reference | Authority | Use case | Real-world example | Score |
|---|---|---|---|---:|
| [Places API (New)](https://developers.google.com/maps/documentation/places/web-service) | Google official docs | Places search/details/autocomplete | Search nearby restaurants and preserve Place IDs | 10/10 |
| [Places API overview](https://developers.google.com/maps/documentation/places/web-service/overview) | Google official docs | Endpoint/field overview | Choose Text Search vs Nearby Search vs Place Details | 10/10 |
| [AI-powered place summaries](https://developers.google.com/maps/documentation/places/web-service/place-summaries) | Google official docs | `generativeSummary`, attribution, coverage | Show a grounded venue summary with required disclosure | 10/10 |
| [Maps AI resources](https://developers.google.com/maps/ai) | Google official docs | AI product/tool entry point | Find Code Assist, Grounding Lite, agent tooling | 10/10 |
| [Agent skills](https://developers.google.com/maps/ai/agent-skills) | Google official docs | Current agent-skill workflow | Ground an AI coding agent in current Maps practices | 10/10 |
| [Agent skills repo](https://github.com/googlemaps/agent-skills) | Google official GitHub | Source/version/provenance | Review upstream skill changes before repinning MDE | 10/10 |
| [Code Assist](https://developers.google.com/maps/ai/code-assist) | Google official docs | Retrieve current Maps docs/samples | Verify a Routes or Places implementation rather than relying on memory | 10/10 |
| [Platform AI repo](https://github.com/googlemaps/platform-ai) | Google official GitHub | Code Assist MCP implementation/setup | Connect the hosted Maps Code Assist MCP to an agent | 10/10 |
| [Gemini API Maps grounding](https://ai.google.dev/gemini-api/docs/maps-grounding) | Google AI official docs | Ground Gemini responses with Maps | Answer “best cafés near this hotel” from current Maps data | 10/10 |
| [Trusted agent architecture](https://docs.cloud.google.com/architecture/agentic-ai-system-with-grounding-using-maps) | Google Cloud architecture | Agentic Maps system design | Build an agent that reasons with Maps-grounded tool results | 10/10 |
| [Gemini Enterprise Maps grounding](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-maps) | Google Cloud docs | Enterprise agent grounding | Add Maps grounding to an enterprise location assistant | 9/10 |
| [Maps Grounding](https://mapsplatform.google.com/maps-products/grounding/) | Google product page | Grounding product family | Compare Grounding, Grounding Lite, Agentic UI, Imagery | 9/10 |
| [Grounding Lite](https://mapsplatform.google.com/maps-products/grounding/#maps-grounding-lite) | Google product page | MCP-based fresh Maps context | Give a non-Gemini LLM current place/location context | 9/10 |
| [Maps Agentic UI Toolkit](https://mapsplatform.google.com/maps-products/grounding/#maps-agentic-ui-toolkit) | Google product page | Agent-native interactive Maps UI | Render a map/tool surface inside an agent experience | 9/10 |
| [Maps Imagery Grounding](https://mapsplatform.google.com/maps-products/grounding/#maps-imagery-grounding) | Google product page | Imagery-grounded generative workflows | Ground generated media in real-world imagery | 8/10 |
| [Maps AI / summaries](https://mapsplatform.google.com/ai/#ai-summaries) | Google product page | Discover AI summaries/features | Evaluate place/area/review summaries for MDE cards | 8/10 |
| [Maps AI / product agents](https://mapsplatform.google.com/ai/#product-ai-agents) | Google product page | Discover agentic Maps products | Evaluate Google-provided agent tools before custom-building | 8/10 |
| [AI Studio Maps styling](https://aistudio.google.com/apps/bundled/maps_styling?showAssistant=true&showPreview=true) | Google AI Studio | Interactive map-style generation | Prototype a branded MDE map style | 8/10 |
| [Grounding with Maps — Gemini API announcement](https://blog.google/innovation-and-ai/technology/developers-tools/grounding-google-maps-gemini-api/) | Google official blog | Product announcement/context | Understand intended Gemini Maps-grounding scenarios | 7/10 |
| [Grounding with Maps — Vertex AI](https://mapsplatform.google.com/resources/blog/grounding-with-google-maps-now-available-in-vertex-ai-power-your-ai-responses-with-google-maps-information/) | Google official blog | Vertex grounding examples | Build a cloud agent answering current place questions | 7/10 |
| [New agentic grounding capabilities](https://mapsplatform.google.com/resources/blog/powering-the-next-era-of-agentic-experiences-announcing-new-grounding-capabilities/) | Google official blog | New grounding/agentic product announcements | Identify new Maps agent UI/grounding options to verify in docs | 7/10 |
| [Ask Maps / Immersive Navigation](https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/) | Google official blog | Consumer-product direction/inspiration | Understand emerging conversational/immersive Maps UX | 6/10 |

## 3. React and Maps JavaScript API

| Reference | Authority | Use case | Real-world example | Score |
|---|---|---|---|---:|
| [`vis.gl/react-google-maps` repo](https://github.com/visgl/react-google-maps) | Canonical React library source | Package/API/issues/releases | Implement MDE React map components and Advanced Markers | 10/10 |
| [`vis.gl` documentation](https://visgl.github.io/react-google-maps/) | Canonical library docs | React component/hook reference | Configure `APIProvider`, `Map`, `AdvancedMarker`, hooks | 10/10 |
| [Google React codelab](https://developers.google.com/codelabs/maps-platform/maps-platform-101-react-js) | Google official tutorial | End-to-end React learning | Build a first React map with current Google guidance | 9/10 |
| [Google RGM basic map example](https://developers.google.com/maps/documentation/javascript/examples/rgm-basic-map) | Google official sample | Minimal React Google Maps example | Verify the basic MDE React setup | 10/10 |
| [Google: introducing React components](https://mapsplatform.google.com/resources/blog/introducing-react-components-for-the-maps-javascript-api/) | Google official blog | Why/how React integration is supported | Validate `@vis.gl/react-google-maps` as the MDE wrapper | 9/10 |
| [vis.gl Discussion #324](https://github.com/visgl/react-google-maps/discussions/324) | Community discussion | Troubleshooting/examples | Diagnose setup questions after checking official docs | 6/10 |
| [Afi: add/style a map](https://blog.afi.io/blog/google-maps-with-react-add-a-google-map-and-style-it/) | Third-party tutorial | Supplementary React example | Compare styling approaches, then verify APIs officially | 5/10 |
| [Afi: build with React](https://blog.afi.io/blog/react-google-maps-build-with-google-maps-using-react/) | Third-party tutorial | Supplementary implementation | Learn a practical React flow, not architecture authority | 5/10 |
| [Medium: React guide](https://medium.com/@ali.abualrob2612/integrating-google-maps-into-react-the-complete-developers-guide-c25fc88245a7) | Community article | Ideas/troubleshooting | Find implementation ideas, then verify against current docs | 4/10 |
| [Medium: AdvancedMarker article](https://medium.com/@masonlynass/using-react-google-maps-advancedmarkers-and-implementing-google-maps-javascript-api-features-7a9ffc2655c4) | Community article | AdvancedMarker experience report | Compare marker composition patterns, verify before copying | 5/10 |

## 4. Third-party APIs, skills, and discovery

| Reference | Authority | Use case | Real-world example | Score |
|---|---|---|---|---:|
| [SerpApi Google Maps API](https://serpapi.com/google-maps-api) | Third-party scraping/API vendor | Search-result scraping outside GMP | Retrieve Google Maps-like search results when explicitly choosing SerpApi, not as a GMP substitute | 4/10 |
| [`deusyu/google-maps-skill`](https://github.com/deusyu/google-maps-skill) | Community GitHub skill | CLI/skill design inspiration | Borrow simple script-first ergonomics, not production Maps architecture | 5/10 |
| [MCPMarket Google Maps Automation](https://mcpmarket.com/tools/skills/google-maps-automation-1) | Third-party catalog | Discover alternative skills | Compare skill UX/commands; never treat as authoritative Maps policy | 3/10 |
| [LobeHub Google Maps skill](https://lobehub.com/es/skills/openclaw-skills-google-maps) | Third-party catalog | Discover community skill patterns | Review alternate packaging ideas only | 3/10 |
| [Google search: google maps react](https://www.google.com/search?q=google+maps+react) | Search/discovery | Find candidate resources | Discover a tutorial, then replace it with an official/canonical source | 1/10 |

## 5. Duplicate and canonicalized supplied links

- `https://ai.google.dev/gemini-api/docs/maps-grounding` was supplied twice; use the single canonical entry above.
- `https://visgl.github.io/react-google-maps/` was supplied twice; use the canonical entry above.
- `https://github.com/googlemaps/agent-skills/tree/main` resolves to the same official repository represented by `https://github.com/googlemaps/agent-skills`.
- `https://github.com/deusyu/google-maps-skill` was supplied twice; use the single community entry above.
- Google Developers URLs containing `hl`, `_gl`, or analytics query parameters are canonicalized to their stable URLs above.

## 6. MDE source-selection rules

1. **Implementation/API contract:** Google Developers docs or canonical library docs first.
2. **Changing fact:** current official docs/Code Assist, never a pinned note or blog alone.
3. **React:** `@vis.gl/react-google-maps` repo/docs + Google samples; do not introduce another wrapper.
4. **AI/grounding:** Google AI/Cloud/Maps docs first; product pages/blogs are discovery/context only.
5. **Third-party source:** inspiration or explicitly selected vendor only; never overrides Google policy/security/API semantics.
6. **Search results:** discovery only; replace with the underlying primary source before coding or review.

## 7. Skill improvements suggested by this audit

- Add **source-tier routing** to the canonical skill so agents know which authority wins when sources disagree.
- Add a **freshness trigger**: pricing, quotas, field availability, regional support, preview/GA state, deprecations, and AI product availability always require a current official lookup.
- Add **Places summaries attribution tests** because current docs require attribution/disclosure when AI-generated summaries are displayed.
- Add **Code Assist hosted-MCP guidance** and avoid deprecated local npm setup; the official `platform-ai` repo now points to the hosted remote MCP as primary.
- Add **product-status labels** (`GA`, preview, experimental, private preview) only when dynamically retrieved, never frozen in `SKILL.md`.
- Add **reference-index routing** to PR review evidence so reviewers cite the exact primary source used for a Maps API/version decision.
