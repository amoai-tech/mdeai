# 21a · GEN UI task tracker (29 records, verified 2026-11-10)

View `GEN_UI` (`db9b1adf8b8d`). Count: **29**. Todo 16 · In Progress 3 · Done 7 · Backlog 3.
Legend: dep = must ship first; PR = implementation; next = the one action that moves it.

| Task | Title (exact) | Status | dep | PR | Next |
| --- | --- | --- | --- | --- | --- |
| SAN-1657 | EPIC · MDE AI — CopilotKit Interactive Foundation | Todo | — | — | adopt order in 21 |
| SAN-1653 | MDE AI — Prove the Shared CopilotKit A2UI Foundation | In Progress | — | #839 | one live signed-in run |
| SAN-1654 | MDE AI — Add the Official CopilotKit Standard UI Components to Ask MDE | In Review | 1653 | #839 | review + live render |
| SAN-1655 | MDE AI — Make AI Controls Use Live State, Real Actions, and Preserve User Edits | Todo | 1654 | — | one writable filter chip |
| SAN-1656 | MDE AI — Show Grounded AI Recommendations in Page Panels With CopilotKit Surfaces | In Review | 1653 | #839 | live run on /rentals |
| SAN-1658 | MDE AI — Add Editable AI Forms and Connect Them to Real MDE Workflows | Todo | 1654,1655 | — | one form that saves |
| SAN-1659 | MDE AI — Add Reusable AI Insights Panels to Existing Dashboards | Todo | 1656,1655 | — | extract panel |
| SAN-1630 | MDE AI — Build One Reusable CopilotKit A2UI Component Catalog | Done | — | main | keep Done |
| SAN-739 | Show Rental Cards Directly Inside AI Chat | Done | — | main | keep |
| SAN-1041 | MDE Rentals — Compare Real Apartments With Interactive AI Cards and Maps | Done | — | main | keep |
| SAN-1631 | Let Ask MDE Change Existing Rentals and Events Filters | Done | — | #828 | fix stale body |
| SAN-1645 | MDE Maps — Let Ask MDE Highlight Real Places on the Existing Map With A2UI | Done | — | main | title says A2UI; code is tool-render |
| SAN-1201 | MDE Events — Create and Publish Events Through AI Chat | Done | — | #817 | fix contradictory body |
| SAN-1250 | Events — Find Real Events With Ask MDE on the Events Page | Done | — | main | keep |
| SAN-1039 | MDE Rentals — Show Accurate, Interactive AI Picks Beside Real Apartments | Todo | 1656 | — | reuse Rentals panel |
| SAN-1666 | MDE Restaurants — Show Grounded AI Recommendations Beside Cards and Map | Todo | 1656 | — | second panel |
| SAN-1667 | MDE Trips — Preview and Save AI Itinerary Suggestions on the Existing Trip Page | Todo | 1656,1655 | — | after 1658 |
| SAN-1660 | MDE App Home — Help Users Navigate Their Workspaces With Smart AI Suggestions | Todo | 1654 | — | P4 |
| SAN-1661 | MDE Events Dashboard — Compare Real Ticket Sales With Interactive AI Insights | Todo | 1659 | — | reuse panel |
| SAN-1662 | MDE Broker Dashboard — Explore Real Listings, Leads, and Viewings With AI Panels | Todo | 1659 | — | reuse panel |
| SAN-1663 | MDE Partner Dashboard — Review and Save AI-Suggested Business Profile Changes | Todo | 1658 | — | OpenDots pattern |
| SAN-1664 | MDE My Account Dashboard — Show My Saved Places and Tickets With AI | Todo | 1659 | — | needs saved-items data |
| SAN-1665 | MDE Contests Admin Dashboard — Inspect Real Contest Activity With AI | Todo | 1659 | — | lowest priority |
| SAN-1632 | MDE Events — Select Real Ticket Tiers and Quantities Through Interactive AI | In Progress | 1655 | — | bind existing selector |
| SAN-1555 | MDE AI OpenDots — Map Editable AI Reviews and Saved Results to Existing Workflows | In Progress | 1658 | — | one domain first |
| SAN-1076 | RE-FAVORITES-001 — Saved apartments | Backlog | — | — | no save handler exists |
| SAN-761 | MDE Host Analytics — Show AI Results as Clear KPI Cards | Backlog | 1659 | — | fold into 1659 |
| SAN-785 | MDE Events — Let Hosts Edit and Copy AI Marketing Drafts | Backlog | 1658 | — | OpenDots pattern |
| SAN-1637 | EPIC · MDE AI — Deliver Interactive Rentals, Events, Tickets & Trusted AI | In Progress | — | — | add acceptance criteria |

## Classification

- **Foundation:** 1653, 1654, 1655, 1656, 1658, 1659, 1630 (done).
- **Product:** 1039, 1632, 1660–1667, 1201, 1250, 739, 1041, 1555, 761, 785.
- **Supporting:** 1631, 1645, 1076.
- **Completed:** 1630, 739, 1041, 1631, 1645, 1201, 1250.
- **Duplicate/obsolete:** none proven. 761 folds into 1659.
- **Post-MVP:** 785, 1665, 1076.

## Known status conflicts

- SAN-1631 and SAN-1201 bodies say "not live"/"not authorized" while Done. Code on main contradicts the body, not the status.
- SAN-1645's title claims A2UI; implementation is AG-UI tool rendering + `focusMapPin`.
- SAN-1637 is the only record without acceptance criteria.
- 14 records still carry only the older `GEN_UI` label, so the view does not filter on `GEN-UI`.
