# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: university students and young working adults in Singapore planning a weekend outing with a friend group of roughly 3–8 people, mostly on their phones. Their job is to get from "let's meet this weekend" to a plan everyone agrees on, without juggling chat threads, polls and map apps.

Families and couples can use WAD2Do too (there's a "Family-friendly" interest to pick), but design decisions favour the friend group.

## Product Purpose

WAD2Do finds Singapore activities that suit each user and turns a group's preferences into an agreed itinerary in one app. Users browse activities ranked by their interests, budget and home area, save the ones they like, share them to a group, vote on them, mark when they are free, and confirm a time to get an editable itinerary.

Onboarding has four steps: interests, usual budget, the MRT station they usually start from (or an area if they're not near one), then a display name and animal avatar.

Success: a group goes from "let's meet this weekend" to an agreed itinerary in one app.

## Positioning

The plan comes from the group's own votes and availability, not one organiser's taste. WAD2Do's planner ranks the group's voted activities, then adds them one stop at a time if each fits the chosen time slot, opening hours, remaining budget and real travel time (OneMap), then puts those stops in the order with the least travel. When showers are forecast, or no forecast is out yet, outdoor stops get indoor alternatives from activities the group already voted for.

## Operating Context

- A group is created with a date range and budget per person, and members join by invite link or 6-character code.
- The group page has three tabs that follow the planning ritual in order: Activities (share and vote), Availability (mark your free 30-minute slots, then pick a time range on the group heatmap and confirm it to build the itinerary), Itinerary (timeline with times, cost per person, travel between stops, why each stop was picked, weather alternatives, and editing).
- Votes, shares and availability update live across members through Supabase Realtime. The itinerary isn't live; saving an edit checks no one else changed the plan first, and asks the editor to load the latest one if they did.
- The Profile page holds preferences, saved activities, the user's submissions and their status, and Delete account.
- Admins review community submissions and manage published activities.
- This is an IS216 (Web Application Development II) group project, group G7, built by six students. The briefing says graders test it in Chrome dev tools from iPhone 6 width up to Bootstrap's XL breakpoint, and mark usability against the Interaction Design Foundation's 10 UI design rules of thumb.

## Capabilities and Constraints

- Stack: Vue 3 (Vite, Vue Router), Bootstrap 5, Supabase (Auth, Postgres, Realtime, Edge Functions, Storage), Playwright end-to-end tests, deployed on Vercel.
- Bootstrap 5 remains the CSS foundation.
- Singapore activities only. Free-tier APIs only.
- Weather: NEA's 24-hour forecast and 4-day outlook on data.gov.sg. Indoor alternatives are offered when showers are forecast or when the outing is too far ahead to have a forecast; dry days and past plans don't get them.
- Activity sources: Google Places (only the place_id is stored; live details are fetched when shown, per Google's terms), STB's Tourist Attractions dataset on data.gov.sg, the team's curated data, and approved community submissions. Curated data supplies price per person, typical duration, category and indoor/outdoor where sources lack them.
- Voting: one vote per member per activity, +1 or −1. Activities with a score above 0 form the shortlist that Plan builds from.
- Community submissions are reviewed by a team admin, and approved ones show a "Community" badge.
- Every element a test touches has a `data-testid`, and every core user flow has its own E2E test.
- Course rule on AI: the briefing limits AI to lower-order tasks (layouts, design inspiration, debugging, boilerplate, test data), but the professor has since clarified that AI may be used for any code as long as the team understands it. The parts relied on AI must still be stated in README.txt.

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
