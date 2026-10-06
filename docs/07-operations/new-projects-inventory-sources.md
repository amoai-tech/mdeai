# New Projects — Medellín inventory sources (SAN-1405)

Research/provenance for the first New Projects pilot. The machine-readable candidate list is
[`new-projects-candidates.json`](./new-projects-candidates.json); SAN-1404 seeds production from it.

## Provenance fields

Every source in the JSON carries its own: `http_status`, `checked_at`, `source_updated_at`, `scope`,
`confidence`, and `facts`. The migration copies those facts verbatim — it never substitutes
`now()`. The verification batch was run **2026-10-06** (all sources returned **HTTP 200**).

## Source tiers

| Tier | Meaning | Examples used |
| -- | -- | -- |
| A — canonical | Developer / official project page | `amarilo.com.co/proyecto/*`, `landing.construccionesprisma.com.co/grand-coral-apartamentos/`, `londonogomez.com/.../river-park-0`, `arquitecturayconcreto.com/proyectos/antioquia/river-park/` |
| B — discovery / snapshot | Marketplace or inventory list, useful but not canonical | `tulugar.com/en/projects/colombia/*`, `zonario.co/proyectos-de-vivienda/medellin/laureles` |
| C — unreliable for a current count | Inaccessible / stale / filtered | `informeinmobiliario.com/` (Nexus page returned **410 Gone**, excluded), metrocuadrado/nuroa/ciencuadras totals (do not use as counts) |

## Accepted candidates (10 — 11 sources, 18 verified unit types)

| Key | Project | Developer (source owner) | Area | Primary source | Type | HTTP | checked_at | source_updated_at |
| -- | -- | -- | -- | -- | -- | -- | -- | -- |
| `medellin:new-project:nexus` | Nexus | G+ Proyectos / Solidus | Laureles | Zonario Laureles | aggregator | 200 | 2026-10-06 | 2026-09-26 |
| `medellin:new-project:nutibara-parkway` | Nutibara Parkway | BEMSA / Proin | Laureles | Zonario Laureles | aggregator | 200 | 2026-10-06 | 2026-09-26 |
| `medellin:new-project:distrito-33` | Distrito 33 | Arco Construcciones e Ingeniería SAS | Laureles | TuLugar | marketplace | 200 | 2026-10-06 | — |
| `medellin:new-project:grand-coral` | Grand Coral | Construcciones Prisma | Laureles | Prisma | developer | 200 | 2026-10-06 | — |

| `medellin:new-project:vigo` | Vigo | SR Proyectos Constructivos | Laureles | TuLugar | marketplace | 200 | 2026-10-06 | — |
| `medellin:new-project:arrayan` | Arrayán | Amarilo | Ciudad del Río | Amarilo | developer | 200 | 2026-10-06 | — |
| `medellin:new-project:saman` | Samán | Amarilo / C.A.S.A. | Ciudad del Río | Amarilo | developer | 200 | 2026-10-06 | — |
| `medellin:new-project:guayacanes` | Guayacanes | Amarilo / C.A.S.A. | Ciudad del Río | Amarilo | developer | 200 | 2026-10-06 | — |
| `medellin:new-project:palma` | Palma | Amarilo | Ciudad del Río | Amarilo | developer | 200 | 2026-10-06 | — |
| `medellin:new-project:river-park` | River Park | Arquitectura y Concreto / Londoño Gómez | Ciudad del Río | Londoño Gómez | developer | 200 | 2026-10-06 | — |

## Facts recorded vs. left unknown

**Seeded (from the source):** identity, developer/source owner, city + neighborhood, project status
(Distrito 33 `Pre-Sale`; Vigo `Under Development`; Arrayán/Samán/Guayacanes `Sobre planos`), the Amarilo
address strings exactly as published, Arrayán's developer coordinates, Arrayán (575,000,000 COP) and
River Park (650,217,000 COP) price-from, the Zonario Tier-B cards for Nexus (136 m², 1,587,000,000 COP, Entrega 2027, NO VIS) and Nutibara Parkway (19–47 m², 370,406,379–834,843,174 COP, NO VIS), and the developer typology blocks — built, private and balcony
area, bedrooms and bathrooms where the page shows them (Arrayán 30–100 m², Samán 56/80/89, Guayacanes
96/110/162, Palma 129/150/166, Distrito 33 from 27 m², Vigo from 31 m², River Park from 47 m²).

**Tier-B promotion rule:** canonical numeric fields (`price_from_cents`, `price_to_cents`, `expected_delivery_year`, `vis_flag`) may be seeded from a Tier-B aggregator card when the value is stated per project. Every such value is also kept in `observed_facts`, and the source row's `confidence` (B) plus `source_updated_at` record its trust level, so downstream can treat Tier-A and Tier-B facts differently. Unknown still stays NULL.

**Unit source attribution:** TuLugar supplies the Distrito 33 and Vigo typologies, so those unit rows
are `source_kind = 'marketplace'`; the rest are `developer`.

**Deliberately NULL / unknown:** every price not shown, availability, delivery dates that were only
"Estimada", coordinates for the nine projects without a developer-stated pair, payment plans and
construction progress. Unknown never becomes `0`, `false`, `available` or a guess.

## Benchmark counts (not MDE inventory)

- Zonario Laureles: **10** active new-housing projects (source updated 2026-09-26) — the count this
  pilot's Laureles half is drawn from.
- Zonario Laureles-Estadio: 21; Zonario Medellín: 119 (city benchmark, not MDE-owned inventory).
- Primavera/Mitula/Trovit listing totals are **listing counts**, not unique developments.

## Conflicts

- Nexus: the `informeinmobiliario.com` page is **410 Gone** and is excluded; identity rests on the
  current Zonario Laureles inventory (Tier B).
- Amarilo Jardines del Río projects publish the developer sales address in two surface forms
  (`Cl. 17 #43F - 122` and `Calle 17 # 43F-122`); both are preserved verbatim inside `observed_facts`.
  The canonical `address` column is normalized to `Calle 17 #43F-122` for display/deduplication.
- No source contradicted another on an accepted fact.

## Compliance

Only structured facts + provenance URLs are stored. No marketing descriptions, photos, renders or
floorplans were copied. External developers are not MDE partners (no `partners`/`partner_members`
rows were created).
