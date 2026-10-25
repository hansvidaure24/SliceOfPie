# The tab bar that floated: debugging an iPhone PWA bug I couldn't reproduce

SliceOfPie is a bill-splitting web app you can install to your home screen. On an iPhone, installed, it had one bug that took me four tries to fix: when the app opened, the tab bar at the bottom floated about 60 points above the bottom edge of the screen. A few seconds later, or as soon as I scrolled, it dropped into place.

It never happened in Safari. It never happened on a desktop, in Chrome's device emulation, or in any of the end-to-end tests. This is how I found the cause, and what I'd do differently.

## The setup

The app draws under the iPhone's status bar, like most home-screen apps that want to feel native:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

The tab bar sat at `position: fixed; bottom: 0`, with `padding-bottom: env(safe-area-inset-bottom)` to keep it clear of the home indicator.

## Three fixes that didn't work

**1. Measure the gap and move the bar.** My first theory was that `position: fixed` was being laid out against a too-short box. So the app measured where `bottom: 0` actually landed compared with the screen height, and moved the bar down by the difference. On the phone, nothing changed.

**2. Stop using `position: fixed`.** Another bar in the app, the "Next" button bar during a split, looked fine in the same screenshots. It wasn't fixed. It sat at the end of the page and used `position: sticky`. So I rebuilt the tab bar the same way, at the end of a column at least the screen's height. On the phone, still too high.

**3. Fake the scroll.** Scrolling fixed it, so I had the app scroll one pixel down and back right after opening. A screen recording showed this sort of worked: the bar slid into place two to four seconds after the app opened, and in one recording it stopped short. I made it nudge straight away and a few more times while the app settled. My tests caught a bug in that version: when two nudges overlapped, the second one saved the first one's temporary page height as the original, and the page stayed 2 pixels taller.

By now I'd shipped three fixes for a bug I had never actually measured.

## Measuring instead of guessing

So I added a small readout to the app. The version line at the bottom of Settings ("SliceOfPie 1.0.0 (abc1234)") now opens a box with the screen size, the window size, `100dvh` and the safe-area insets, both when the app opened and right now. While the nudges were still in, it also listed the window height after each one.

One screen recording of opening the app and tapping that line was enough:

```
Screen 402×874, installed (iOS)
At launch: window 402×812, visible 402×812, 100dvh 812, safe area 0/0
Now:       window 402×874, visible 402×874, 100dvh 874, safe area 62/34
Window height after each nudge: 0.0s 814, 0.6s 814, 1.5s 814, 3.0s 874
```

I also pulled frames out of the recording every quarter of a second and measured them. The logo stayed at exactly the same height throughout. The tab bar's top edge was at 715 points, then 775 once it settled: a 60-point drop with nothing else moving.

## What was actually happening

When a Home Screen app that draws under the status bar opens, iOS gives the page a window **62 points short** of the screen, exactly the height of the status bar, and reports **no safe areas at all**. A few seconds later, or on the first real finger scroll, it resizes the window to the full screen and the insets appear.

That explains every failed fix:

- The strip at the bottom wasn't part of the page yet, so nothing the page drew could reach it, fixed or sticky.
- Scrolling from code doesn't count. Only a real scroll makes iOS measure again, and pages can't fake one. The window height sat at 814 through every nudge and only became 874 when iOS fixed it on its own schedule.
- Safari tabs don't have the bug, which is why it never showed up there.

## The fix

Stop drawing under the status bar:

```html
<meta name="apple-mobile-web-app-status-bar-style" content="black">
```

With a solid status bar, the page starts just below the clock, so the height it gets when it opens is the height it keeps. There's nothing for iOS to resize. The price is a black strip behind the status bar, which is barely visible in the app's dark theme.

On the iPhone, the installed app now opens with the tab bar at the bottom from the first frame, with no slide and no scroll needed. I removed the nudges, because code that doesn't help is still code someone has to read. I kept the readout in Settings.

## What I'd do differently

- **Measure on the real device before the second fix, not after the third.** Every fix I tried was reasonable for the theory I had. The theory was wrong.
- **Build the diagnostic into the app.** A hidden readout of sizes and the build ID cost about 50 lines and turned "it still looks wrong" into numbers. It's staying.
- **Treat a screen recording as data.** Pulling frames and measuring pixels showed what moved, by how much, and when.
- **Tests can't see platform bugs, but they still earn their keep.** No test could reproduce this. A test did catch my workaround leaving the page 2 pixels taller.
- **Delete workarounds that don't work.** They're just noise that suggests a problem was handled.
