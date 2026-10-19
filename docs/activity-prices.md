# Activity prices and areas

Checked 19 October 2026. Covers all 34 locations in the draft catalogue: 28 numeric prices and six unverified prices. All amounts are SGD per person for the specific experience or order described below. This is a researched seed proposal, not a live pricing API or a completed database import.

## Price choices

- Use ordinary adult weekend rates where available. Special discounts, memberships and shared court/rug costs are not assumed.
- `0` means a free park visit. `NULL` means unverified and must never be converted to zero.
- Public walks at Woodlands Waterfront and East Coast use a curated S$0 admission assumption based on NParks visitor information, which does not explicitly publish an admission tariff. Other park sources explicitly describe free activities, or retain the previously documented Jurong/Bishan price evidence.
- Museum prices use standard adult admission so free entry is not assumed for every visitor. The notes explain Singapore citizen/PR and student concessions.
- Cafe entries describe a specific example order when a menu price could be verified. They are not estimates of average customer spending.
- The Mind Cafe and K Bowling amounts include the published 10% service charge and 9% GST, calculated as menu price × 1.10 × 1.09 and rounded to cents. K Bowling shoe rental remains extra. Coastal Settlement's S$19 is a menu price before service/GST because their percentages were not established by that menu.
- boulder+ includes shoe rental. SuperPark includes a new pair of grip socks and was checked for 24 October, 2–4pm. Prices can change with the date and time.
- Potters' Guilt uses the 3-hour Do-It-All experience, not the shorter wheel experience. TUFT CLUB uses its 3-hour 50cm workshop at the advertised S$110 sale price. Recheck the sale before booking.
- The six unverified records remain nullable: two pickleball courts, Thow Kwang, Creamier, ECHO and Suzuki. Court prices require a player count and equipment assumptions; cafe retail product prices are not drink prices. Thow Kwang's old shop listing does not establish a current public per-person workshop quote.

## Catalogue

| Activity | Area | price_per_person | Selected experience, conditions and evidence |
| --- | --- | ---: | --- |
| Garden walk at Jurong Lake Gardens | Jurong | 0.00 | Self-guided garden walk only. Food, parking and rentals extra. [Source](https://lightsbythelake.nparks.gov.sg/files/Jurong_Lake_Gardens_Brochure.pdf) |
| Birdwatching at Sungei Buloh Wetland Reserve | Kranji | 0.00 | Self-guided birdwatching only. Food and transport extra. [Source](https://www.nparks.gov.sg/visit/parks/sungei-buloh-wetland-reserve/activities) |
| Waterfront stroll at Woodlands Waterfront Park | Woodlands | 0.00 | Public waterfront walk only. Food and parking extra. [Source](https://www.nparks.gov.sg/visit/parks/park-detail/woodlands-waterfront-park) |
| Waterway walk at Punggol Waterway Park | Punggol | 0.00 | Self-guided waterway walk only. Food and rentals extra. [Source](https://www.nparks.gov.sg/visit/parks/punggol-waterway-park/activities) |
| Riverside walk at Bishan-Ang Mo Kio Park | Bishan | 0.00 | Self-guided park walk only. Food and rentals extra. [Source](https://www.nparks.gov.sg/visit/parks/bishan-ang-mo-kio-park/activities) |
| Seaside walk at East Coast Park | East Coast | 0.00 | Public seaside walk only. Food, parking and rentals extra. [Source](https://www.nparks.gov.sg/visit/parks/park-detail/east-coast-park) |
| Mangrove and seaside walk at Pasir Ris Park | Pasir Ris | 0.00 | Self-guided mangrove and park walk only. Food and rentals extra. [Source](https://www.nparks.gov.sg/visit/parks/pasir-ris-park/activities) |
| Hike at Chestnut Nature Park | Bukit Panjang | 0.00 | Self-guided hike only. Food and transport extra. [Source](https://www.nparks.gov.sg/visit/parks/chestnut-nature-park/activities) |
| Coastal walk at Labrador Nature Reserve | Labrador | 0.00 | Self-guided coastal walk only. Food and transport extra. [Source](https://www.nparks.gov.sg/visit/parks/labrador-nature-reserve/activities) |
| Bouldering at boulder+ Aperia | Kallang | 38.00 | Adult day pass S$32 plus shoe rental S$6. Bring socks or add S$2. [Source](https://www.boulderplusclimbing.com/rates) |
| Rope climbing at Climb Central Sports Hub | Kallang | 38.20 | Adult first-timer set, GST inclusive. Returning-climber rates differ. [Source](https://www.climbcentral.sg/new-rates-2026) |
| Indoor adventure at Adventure HQ | Yishun | 68.00 | Guest single pass for weekends, PH, PH eves and school holidays. GST included. [Source](https://hometeamnshelp.zendesk.com/hc/en-sg/articles/4408088469145-What-are-the-prices-and-rates-for-Adventure-HQ) |
| Indoor games at SuperPark Singapore | Suntec | 41.40 | 2-hour regular Super Pulse ticket S$37.90 plus grip socks S$3.50. Checked for Sat 24 Oct 2026, 2-4pm; other slots may differ. [Source](https://ecom.roller.app/superparksingapore/ticketing/en/product/862264?date=2026-10-24) |
| Cable wakeboarding at Singapore Wake Park | East Coast | 55.00 | 1-hour beginner System A lesson including helmet, vest and house wakeboard. GST included. [Source](https://singaporewakepark.com/pages/ride-schedule-rates) |
| Pickleball at Pickle & Bones at TRIFECTA | Somerset | Unverified | Court hire is shared. Confirm the current court rate, duration, equipment and player count before calculating a per-person price. [Source](https://trifectasingapore.com/) |
| Indoor pickleball at The Sports Arina Jalan Kayu | Sengkang | Unverified | Confirm Jalan Kayu court hire, equipment and player count. A per-court rate is not a per-person price. [Source](https://thesmartlocal.com/read/the-sports-arina-jalan-kayu/) |
| Pottery workshop at The Potters' Guilt Pearl's Hill | Pearl's Hill | 88.00 | 3-hour Pottery Do-It-All at Pearls Hill. Firing and glazing add S$10 per piece. [Source](https://www.thepottersguilt.com/classes) |
| Art jamming at Artify Studio | Kampong Glam | 45.00 | Regular guided 2.5-hour art jamming, including weekend slots. Weekday mornings are S$38. [Source](https://www.artifystudio.com/art-jamming) |
| Starter splatter painting at Splat Paint House | Upper Thomson | 46.00 | Starter splatter package. Optional upgrades and delivery extra. [Source](https://www.splatpainthouse.com/menu) |
| Rug tufting at TUFT CLUB | Boat Quay | 110.00 | One 50x50cm rug per person, 3-hour workshop. Current sale price; regular price S$135. Extensions extra. [Source](https://tuftclub.com/products/shortened-tufting-workshop) |
| Pottery workshop at Thow Kwang Pottery Jungle | Jurong | Unverified | Request the current public workshop price and inclusions. The old shop listing does not establish a current per-person rate. [Source](https://thowkwang.com.sg/faq/) |
| Board games at The Mind Cafe Mega Store | Rochor | 31.05 | Weekend lunch set S$25.90 plus 10% service and 9% GST (S$31.05). Gaming available 11am-6pm; includes one main, drinks and snacks. [Source](https://themindcafe.sg/wp-content/uploads/2026/07/2026-July-Menu-Haf.jpg-724x1024.jpeg) |
| Escape room at Xcape Singapore | Bugis | 40.00 | 90-minute escape game at peak/weekend rate. Shorter games and off-peak slots cost less. [Source](https://www.xcape.sg/) |
| Mystery mini golf at Kulnari | Boat Quay | 39.00 | Adult minigolf only, advertised for Sat 24 Oct 2026. Weekday dates from S$35. Dining and drinks extra; confirm final checkout. [Source](https://feverup.com/m/427476) |
| VR game at Sandbox VR Orchard Central | Somerset | 65.00 | Weekend tickets from S$65. Weekday tickets from S$48. Confirm the selected experience and final checkout. [Source](https://sandboxvr.com/sg/singapore/orchard-central) |
| Bowling at K Bowling Club | Somerset | 40.77 | Two weekend evening games S$34 plus 10% service and 9% GST (S$40.77). Shoe rental extra; time depends on group size. [Source](https://kbowlingclub.com/) |
| Waffles and ice cream at Creamier Toa Payoh | Toa Payoh | Unverified | Spending depends on waffle size, number of scoops and sharing. Confirm the Toa Payoh dine-in menu. [Source](https://creamier.com.sg/) |
| Brunch at The Coastal Settlement | Changi | 19.00 | Example order: one TCS Waffle Stack. Menu price excludes service charge and GST. Drinks extra; other brunch orders differ. [Source](https://www.thecoastalsettlement.com/_files/ugd/497a81_adcb45cbe9a04862b749dcea9daea4f3.pdf) |
| Brunch at W39 Bistro | West Coast | 15.00 | Example order: mushroom eggs Benedict from the weekend brunch menu. Drinks and any applicable taxes or service charges extra. [Source](https://w39bistro.com/pages/w39-menu) |
| Coffee and matcha at ECHO KADA | Maxwell | Unverified | Confirm the in-store drink menu. Online bean and matcha retail prices are not cafe drink prices. [Source](https://www.echohouse.sg/) |
| Coffee at Suzuki Cafe and Roastery | Jurong | Unverified | Confirm a drink from the current cafe menu. Coffee bean retail prices are not cafe drink prices. [Source](https://www.suzukicoffee.com.sg/cafe/) |
| Art exhibition visit at National Gallery Singapore | City Hall | 20.00 | Standard adult general admission. Free for Singapore citizens and PRs, and other eligible visitors. Special exhibitions differ. [Source](https://www.nationalgallery.sg/sg/en/visit/visitor-information.html) |
| Contemporary art at Singapore Art Museum Distripark | Tanjong Pagar | 10.00 | Standard adult admission. Free for Singapore citizens, PRs, locally based students and other eligible visitors. [Source](https://www.singaporeartmuseum.sg/Visit) |
| Onsen session at Joya Onsen Cafe | Joo Koon | 45.00 | Adult public onsen full-day pass, tax included. Meals and private onsen extra. Separate 3-hour promotion may be available. [Source](https://www.joyaonsencafe.com/public-onsen-membership) |

## Apply to Supabase

The seed helper is a temporary table, dropped at transaction commit. The script explicitly enables RLS and revokes privileges from `PUBLIC`, `anon` and `authenticated`. Run the whole script together as the SQL Editor's database owner (`postgres`), which can populate its own helper without client policies. If the editor asks about RLS, choose Enable RLS and use the updated script. This does not change the existing RLS policies on `public.activities`.

1. Import the original 34 curated activities first if they do not already exist. The earlier nine-column CSV is still the original draft; use this SQL as its enrichment step.
2. Open `supabase/seed-activity-prices.sql` in Supabase SQL Editor and review the values. It matches exact name, address and `source = 'curated'`. Missing or duplicate matches abort the transaction before any data change. If a venue name/address has been edited, reconcile the matching row before running.
3. Run the script. It fills blank areas and NULL prices, adds nullable `price_note`, and keeps existing non-null prices and notes. Notes are added only when they describe the existing/proposed price. A rerun makes no changes once fields are filled. To revise a previous non-null price, review and update that activity explicitly.
4. When filling a price, the script also sets the exact package duration for SuperPark (120 min), Wake Park (60), Potters' Guilt (180), Artify (150), Splat (60), TUFT CLUB (180) and Xcape (90). This keeps the price and visit duration consistent for Plan. It preserves other existing durations.
5. Review the final SELECT, particularly the six unverified prices, and reload Activities. The script has not been executed against the live database here.

## How the page uses this data

The Area dropdown uses nonempty trimmed `activities.area` values, deduplicated and alphabetised. Category, area, indoor/outdoor, keyword and price filters combine. Price bands are Free, under S$20 (including free), S$20 to under S$50, S$50 to under S$100, and S$100+. Unknown/invalid prices are excluded only when a price band is selected.

Sorting is Catalogue order, Price low to high, or Price high to low. Numeric strings from the database sort numerically. Missing, blank, negative and invalid prices stay at the end in both directions. Equal prices keep catalogue order. Clear filters resets the sort too. All choices survive a detail-page round trip within the same browser tab.

Cards display the activity's `description` when available. The detail page displays optional `price_note` beside the price. These fields need no client credentials or extra API call: the existing `select('*')` retrieves them. Personalised ranking and itinerary planning logic remain the team's work.
