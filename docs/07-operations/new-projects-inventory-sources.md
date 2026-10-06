# New Projects — Medellín inventory sources (SAN-1405)

Research/provenance for the first New Projects pilot. The machine-readable candidate list is
[`new-projects-candidates.json`](./new-projects-candidates.json); SAN-1404 seeds production from it.

## Source tiers

| Tier | Meaning | Examples used |
| -- | -- | -- |
| A — canonical | Developer / official project page | `amarilo.com.co/proyecto/*`, `landing.construccionesprisma.com.co/grand-coral-apartamentos/`, `londonogomez.com/.../river-park-0`, `arquitecturayconcreto.com/proyectos/antioquia/river-park/` |
| B — discovery / snapshot | Marketplace or inventory list, useful but not canonical | `tulugar.com/en/projects/colombia/*`, `zonario.co/proyectos-de-vivienda/medellin/laureles` |
| C — unreliable for a current count | Inaccessible / stale / filtered | `informeinmobiliario.com/` (Nexus page returned **410 Gone**, excluded), metrocuadrado/nuroa/ciencuadras totals (do not use as counts) |

## Accepted candidates (10)

| Key | Project | Developer (source owner) | Area | Primary source | HTTP |
| -- | -- | -- | -- | -- | -- |
| `medellin:new-project:nexus` | Nexus | G+ Proyectos / Solidus | Laureles | Zonario Laureles (B) | 200 |
| `medellin:new-project:distrito-33` | Distrito 33 | Arco Construcciones e Ingeniería SAS | Laureles | TuLugar (B) | 200 |
| `medellin:new-project:grand-coral` | Grand Coral | Construcciones Prisma | Laureles | Prisma (A) | 200 |
| `medellin:new-project:nutibara-parkway` | Nutibara Parkway | BEMSA / Proin | Laureles | Zonario Laureles (B) | 200 |
| `medellin:new-project:vigo` | Vigo | SR Proyectos Constructivos | Laureles | TuLugar (B) | 200 |
| `medellin:new-project:arrayan` | Arrayán | Amarilo | Ciudad del Río | Amarilo (A) | 200 |
| `medellin:new-project:saman` | Samán | Amarilo / C.A.S.A. | Ciudad del Río | Amarilo (A) | 200 |
| `medellin:new-project:guayacanes` | Guayacanes | Amarilo / C.A.S.A. | Ciudad del Río | Amarilo (A) | 200 |
| `medellin:new-project:palma` | Palma | Amarilo | Ciudad del Río | Amarilo (A) | 200 |
| `medellin:new-project:river-park` | River Park | Arquitectura y Concreto / Londoño Gómez | Ciudad del Río | Londoño Gómez (A) | 200 |

All checks were performed **2026-10-06**.

## Facts recorded vs. left unknown

Confirmed and seeded: project identity, developer/source owner, city + neighborhood, project status
("Sobre planos" → `pre_sale` where stated), Amarilo address `Cl. 17 #43F - 122`, Arrayán developer
coordinates, Arrayán price-from (575,000,000 COP), River Park price-from (650,217,000 COP), and the
area typologies the developer pages show.

Deliberately **NULL / unknown**: every price not shown, availability, delivery dates that were only
"Estimada", coordinates for the nine projects without a developer-stated pair, payment plans, and
construction progress. Unknown never becomes `0`, `false`, `available` or a guess.

## Benchmark counts (not MDE inventory)

- Zonario Laureles: **10** active new-housing projects (source updated 2026-09-26) — the count this
  pilot's Laureles half is drawn from.
- Zonario Laureles-Estadio: 21; Zonario Medellín: 119 (city benchmark, not MDE-owned inventory).
- Primevera/Mitula/Trovit listing totals are **listing counts**, not unique developments, and are not
  used as project counts.

## Conflicts

- Nexus: the `informeinmobiliario.com` page is **410 Gone** and is excluded; identity rests on the
  current Zonario Laureles inventory (Tier B).
- Amarilo Jardines del Río projects share the developer sales address `Cl. 17 #43F - 122`; that is the
  source's own address, not an inference about a specific tower.
- No source contradicted another on an accepted fact. Conflicts, if found later, are retained as
  separate source rows rather than averaged.

## Compliance

Only structured facts + provenance URLs are stored. No marketing descriptions, photos, renders or
floorplans were copied. External developers are not MDE partners (no `partners`/`partner_members`
rows were created).
