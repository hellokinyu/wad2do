# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: university students and young working adults in Singapore planning a weekend outing with a friend group of roughly 3–8 people, mostly on their phones. Their job is to get from "let's meet this weekend" to a plan everyone agrees on, without juggling chat threads, polls and map apps.

Families and couples can use WAD2Do too (onboarding asks who you go out with), but design decisions favour the friend group.

## Product Purpose

WAD2Do finds Singapore activities that suit each user and turns a group's preferences into an agreed itinerary in one app. Users browse activities ranked by their interests, budget and home area, share the ones they like to a group, vote on them, mark when they are free, and press Plan to get an editable itinerary.

Success: a group goes from "let's meet this weekend" to an agreed itinerary in one app.

## Positioning

The plan comes from the group's own votes and availability, not one organiser's taste. WAD2Do's planner ranks the group's voted activities, then adds them one stop at a time if each fits the chosen time slot, opening hours, remaining budget and real travel time (OneMap). When showers are forecast, outdoor stops get indoor alternatives from activities the group already voted for.

## Operating Context

- A group is created with a date range and budget per person, and members join by invite link or 6-character code.
- The group page has three tabs that follow the planning ritual in order: Activities (share and vote), Availability (mark free 30-minute slots on a heatmap, pick a slot, press Plan), Itinerary (timeline with times, cost per person, why each stop was picked, weather alternatives, and editing).
- Votes and shares update live across members through Supabase Realtime.
- This is an IS216 (Web Application Development II) group project, group G7, built by six students. The briefing says graders test it in Chrome dev tools from iPhone 6 width up to Bootstrap's XL breakpoint, and mark usability against the Interaction Design Foundation's 10 UI design rules of thumb.

## Capabilities and Constraints

- Stack: Vue 3 (Vite, Vue Router), Bootstrap 5, Supabase (Auth, Postgres, Realtime, Edge Functions, Storage), Playwright end-to-end tests, deployed on Vercel.
- Bootstrap 5 remains the CSS foundation.
- Singapore activities only. Free-tier APIs only. Weather alternatives only for outings within the 4-day forecast.
- Activity sources: Google Places (only the place_id is stored; live details are fetched when shown, per Google's terms), STB's Tourist Attractions dataset on data.gov.sg, the team's curated data, and approved community submissions. Curated data supplies price per person, typical duration, category and indoor/outdoor where sources lack them.
- Voting: one vote per member per activity, +1 or −1. Activities with a score above 0 form the shortlist that Plan builds from.
- Community submissions are reviewed by a team admin, and approved ones show a "Community" badge.
- Every element a test touches has a `data-testid`, and every core user flow has its own E2E test.
- Course rule: AI may help with layouts, design inspiration, debugging, boilerplate and test data, but not core business logic or critical frontend interactivity. Parts relied on AI must be stated in README.txt.

## Brand Commitments

- Name: WAD2Do, with the existing logo at `src/assets/wad2do-logo.png`.
- Animal profile avatars (`src/components/AnimalAvatar.vue`, `src/data/profileAnimals.js`).
- Voice: casual and friendly plain English with light Singapore phrasing where it reads naturally (e.g. "Keen" / "Not keen" for votes). No heavy Singlish.

## Evidence on Hand

- Problem research cited in the spec: Leu et al. (2023) on how young workers in Singapore discover food and dining; URA's "More recreation closer to homes"; Jin et al. (2025) on social networks in joint leisure planning.
- Curated activity photos in `public/images/`.
- No user testimonials, usage metrics or user research exist. Do not invent them.

## Product Principles

1. The group decides. Surface everyone's input and show how it becomes the plan; never hide why something was or wasn't picked.
2. One flow, one app. Each step should hand off clearly to the next: discover, share, vote, pick a time, plan.
3. Phone-first for real outings. Most use happens on phones, in chats and on the go.
4. Show real constraints. Prices, opening hours, travel time, budget and weather are facts; flag conflicts plainly instead of hiding them.
5. Calm while live. Others' changes arrive in real time, so updates should inform without making the screen shift under the user.
