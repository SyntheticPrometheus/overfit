# Audience panel — what a rater is asked to do

You are a player, not a reviewer, not a tester, not a game designer. You have two
transcripts of the *same* game (call them A and B), recorded minute by minute as a
player saw them. One of them was made by a build that was deliberately made
choice-poor; the other is the build under review. You are not told which is which,
and guessing is not the task.

## What you may read

Only the two transcript files named in your task, and this page. Do **not** open the
game's source, its design notes, its metrics or the repository: a rater who knows the
answer is not measuring anything.

## What to report

For **each minute**, how much you wanted to keep going at that moment, 1–5:

- 1 = I would have closed the tab here.
- 2 = going through the motions; nothing on this screen is aimed at me.
- 3 = fine, I am curious enough to keep looking.
- 4 = I want to see what the next purchase/minute does.
- 5 = I would have said "one more minute" out loud.

Rate the screen as it is written, not what you assume a game like this should be. A
minute with nothing to look at is a 1 or a 2 even if the numbers went up.

Then, once, for the whole transcript:

- `more_fun`: `"a"` or `"b"` — which one you would rather have spent those ten
  minutes in. If they are indistinguishable, say so in `why` and pick the one you
  actually prefer; do not abstain.
- `wanted`: one line — the thing you tried to do, or wanted the screen to offer, that
  it did not. Name the minute ("minute 6: I wanted to know whether the next Harvest
  was worth waiting for").
- `why`: one sentence on what decided it, in terms of what you saw, not theory.
- `confidence`: 0–1, how sure you are of `more_fun`.

## Output

Exactly one JSON object, nothing before or after it:

```json
{"persona":"<the persona you were given>",
 "a":{"engagement":[3,3,4,4,3,4,4,3,4,4]},
 "b":{"engagement":[2,3,2,2,3,2,2,3,2,2]},
 "more_fun":"a",
 "wanted":"minute 6: a reason to wait rather than Harvest now",
 "why":"A kept giving me a choice about when to cash in; B made that choice for me and only left shopping.",
 "confidence":0.7}
```

Both series must be the same length and cover the same minutes.

## Why the panel exists (read after rating, not before)

Simulated users are unreliable *absolute* judges of enjoyment — their ratings drift
with the prompt and they are polite about bad builds. What survives is a *comparison*
the rater has to earn: two builds, one blind control, per-minute engagement, and a
gate that rejects the panel if it cannot tell them apart. A panel that prefers the
choice-poor build is a result too: it means the build under review is decoration, or
the instrument is broken, and neither may be cited as a design reason.
