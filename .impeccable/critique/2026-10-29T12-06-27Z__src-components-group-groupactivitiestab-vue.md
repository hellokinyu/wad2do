---
target: group Activities tab
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\kinyu\\Documents\\SMU Modules\\Y2S1\\IS216 Web Application Development 2\\wad2do\\src\\components\\group\\GroupActivitiesTab.vue"
target_fingerprint: "sha256:7bb9b2b0bf4310013701741198b0ce35e3667f2225f74040d52d707e850b64b3"
target_path: "C:\\Users\\kinyu\\Documents\\SMU Modules\\Y2S1\\IS216 Web Application Development 2\\wad2do\\src\\components\\group\\GroupActivitiesTab.vue"
timestamp: 2026-10-29T12-06-27Z
slug: src-components-group-groupactivitiestab-vue
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent). Rendered with Playwright route mocks at 375px and 1280px; overlay ran headless.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live dot, progress, toasts, score pop work; completion message sits at the top while the user finishes at the bottom |
| 2 | Match System / Real World | 3 | Keen / Not keen lands; "score", "+1" and medals are system language; "favourites go into the itinerary" overpromises |
| 3 | User Control and Freedom | 3 | Tap-again, Undo, Cancel and Esc; Undo unreachable by keyboard; Remove has no undo and wipes others' votes |
| 4 | Consistency and Standards | 2 | Card diverges from ActivityCard; two CTAs to the same page; heading repeats tab name; mixed focus rings |
| 5 | Error Prevention | 3 | Remove confirms, states consequence, focuses Cancel; per-card save guard |
| 6 | Recognition Rather Than Recall | 3 | Names, "Needs N", move chips visible; live dot meaning only in title |
| 7 | Flexibility and Efficiency | 1 | No unvoted filter or jump to next unvoted; ~245px cards on phones |
| 8 | Aesthetic and Minimalist Design | 2 | Support level encoded 5-6 ways per card |
| 9 | Error Recovery | 2 | Load error gives no cause; failed vote: 3s toast, no retry, silent revert |
| 10 | Help and Documentation | 3 | "How does voting work?" concise; "Needs N more" is real contextual help |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

LLM: product-specific in behaviour (stable order with Update order, move-chip preview, shortlist cost per card matching the planner's score>0 rule), category-generic in surface (Bootstrap pills, medals, thin meter; reads like any poll). Brand animal avatars absent; medals frame agreement as a contest.

Deterministic scan: CLI 0 findings (also with --no-config). Browser overlay: side-tab (inset 4px green stripe on .vote-card.shortlisted; redundant with the shortlist text), low-contrast Cancel button 3.5:1 on danger-subtle panel (true positive), low-contrast "See itinerary" 4.3:1 (advisory, underlined). Review found focus ring ~1.9:1 and small targets that the detector does not measure.

## Priority Issues

- [P1] Voting starts below the fold on phones; primary button is "+ Add", not voting. Fix: drop duplicate H2, one-line summary with help link, demote Add, first vote row visible at 375x667. Command: /impeccable layout
- [P1] Phone toast covers the just-voted card; Undo keyboard-unreachable in 5s, no pause; failed vote 3s, no retry. Fix: in-card confirmation with Undo next in tab order; toast only for failures with Retry and pause-on-hover/focus. Command: /impeccable harden
- [P2] Alphabetical tie-break creates phantom "ranking changed" and red ▼ on untouched cards; "Needs 1 more keen vote" beside "Everyone has voted" is a dead end. Fix: tie-break by current position or share time, ignore tie-only moves, honest dead-end copy. Command: /impeccable harden
- [P2] Cards over-encode support 5-6 ways (13 visible elements at 375). Fix: animal-avatar voter row replaces meter, waiting count and name lists; merge score and shortlist; medal or Top pick; drop stripe; quieter active Not keen. Command: /impeccable distill
- [P2] Contrast and targets: Cancel 3.5:1, See itinerary 4.3:1, focus ring ~1.9:1; Remove 52x23, See itinerary 81x16, help summary 21px, btn-sm ~31px; skeleton vote placeholders collapse on phone. Fix: solid 2px primary focus ring, 44px targets, Remove as outline button, Cancel on white. Command: /impeccable audit

## Persona Red Flags

- Casey: toast hides tapped row; Update order bar out of thumb reach; <2 cards visible; Remove 23px tall; silent failed vote.
- Jordan: unlabeled pulsing dot; +3 and medals explained only in collapsed help; Update order appears unexplained; See itinerary skips Availability.
- Sam: Undo unreachable in time; ~1.9:1 focus ring; "1 places up"; voter names 12.8px grey; new order not announced.
- Mei (student from Telegram link): hunts for unvoted cards; Not keen shown by name in red; no handoff to Availability when done.

## Minor Observations

Hard-coded #eee/#111/#f3f3f3/#666; desktop meter ~800px wide; toast persists through Update order and remove confirm; S$ vs $ currency inconsistency; empty-state icon reuses the Keen glyph; every live event refetches all queries including member names.

## Questions to Consider

- Should Not keen be public by name in a friend group?
- Would "On the shortlist" / "Not yet" sections serve better than a ranked leaderboard with medals?
- Should unvoted activities be shown one at a time, with the list as the review screen?
