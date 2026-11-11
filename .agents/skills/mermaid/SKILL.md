---
name: mermaid
description: Use when a diagram is clearer than prose; creates concise Mermaid diagrams when a visual materially improves understanding of architecture, workflows, state transitions, dependencies, or data relationships.
---

**MERMAID — Useful Technical Diagrams**

**Goal**
Create a diagram only when it makes architecture, flow, state, dependencies, or data relationships easier to understand than text.

**Choose the right type**
- flowchart: workflow/dependencies
- sequenceDiagram: interactions/order
- stateDiagram-v2: state transitions
- erDiagram: data relationships
- journey: user journey
- classDiagram: structural model only when useful

**Process**
1. Verify the real entities/steps from current sources.
2. Choose the simplest diagram type.
3. Include only nodes/edges needed to answer the question.
4. Use short labels and clear direction.
5. Do not invent services, states, tables, or relationships.
6. Check syntax and logical flow.

**Output**
Provide:
1. valid Mermaid block
2. 1–3 sentence explanation only if needed
If text is clearer, say no diagram is necessary.

**Rules**
- One diagram is usually enough.
- No decorative diagrams.
- Prefer simple over comprehensive.
- Split diagrams if one becomes unreadable.
- Keep implementation truth accurate.
