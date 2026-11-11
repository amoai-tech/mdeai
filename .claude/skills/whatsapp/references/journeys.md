# MDE WhatsApp user journeys

**Product plan:** https://linear.app/amo100/document/mde-whatsapp-meta-cloud-api-mastra-and-supabase-implementation-plan-0f969111db21

## Rentals / real estate
Visitor: "Find a furnished 2BR in Laureles under COP 4M, pet friendly."
1. Verified inbound → existing concierge intent → canonical rental eligibility/search → truthful listing summaries and secure details links.
2. Authenticated viewing request → exactly one saved lead/showing on retry → authorized assigned broker notification after commit and consent.
3. Broker follows authenticated short-lived action link → existing service transitions same request → truthful saved customer status.
Fail: no coordinates means no pin; no verified photos means no photo; missing ownership/availability remains unknown. Wrong broker and phone-only action fail closed.

## Restaurants / venues
Visitor: "Find a quiet restaurant in El Poblado for four on Saturday."
Use existing venue/restaurant search and authorized Places results. Show brief grounded descriptions plus safe website map/details links. A booking request remains *pending* until independently confirmed by an authorized venue/provider. No invented reservation times.

## Events / ticketing (advanced)
Visitor: "What's happening this weekend?" → existing event discovery → mobile checkout → payment/authorized ticket state → optional approved reminder to opted-in paid attendee. Refund, cancellation, STOP or unpaid state suppresses dispatch. Never expose a raw ticket QR/bearer secret in shared WhatsApp chat.

## Support and handoff
Unknown account or unclear user intent → minimal clarification or operator handoff. Agent can summarize/draft; human approval/identity rules stay in existing workflow. Message content/phone numbers must not leak into public logs or other users' sessions.

**Common proof:** signed ingress, short grounded reply, accurate deep link, authorized action, deduped retry, failure recovery and independent web /chat behavior.
