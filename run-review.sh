#!/bin/bash
# Unattended UI review loop: critic → fixer → repeat until perfect.
# Run from the SliceOfPie repo root. Assumes localhost:8080 is already serving the app.

REPO="/Users/hanschandler.vidaure/Documents/Projects/SliceOfPie"
CRITIQUE="/tmp/sliceofpie-critique.md"
VERDICT="/tmp/sliceofpie-verdict.txt"
SCREENS=(
  screenWelcome
  screenItems
  screenPeople
  screenQuick
  screenCapture
  screenSummary
  screenDetail
  screenHistory
  screenSettings
)

cd "$REPO"

PASS=0

while true; do
  PASS=$((PASS + 1))
  echo ""
  echo "######################################"
  echo "  PASS $PASS"
  echo "######################################"
  echo ""

  FOUND_ISSUES=0

  for screen in "${SCREENS[@]}"; do
    echo "========================================="
    echo "[$PASS] Reviewing: $screen"
    echo "========================================="

    # Step 1: Critic reviews the screen
    claude -p "You are a strict UI/UX design critic reviewing SliceOfPie, a bill-splitting PWA. This is review pass #$PASS.

The app repo is at $REPO. It uses screen-based navigation — all screens are divs toggled by JS with IDs like 'screenWelcome', 'screenSettings', etc.

Review the screen '$screen' in index.html and its related TypeScript/CSS. Consider both desktop and mobile (375px) layouts.

Critique:
- Layout and spacing (dead space, alignment, visual balance)
- Typography and hierarchy
- Color contrast and accessibility
- Interactive element clarity (is the intent obvious?)
- Mobile responsiveness
- Consistency with other screens
- Missing affordances or confusing UX flows

Write your findings to $CRITIQUE in this exact format:

# Screen: $screen (Pass $PASS)

## Critical (must fix)
- [file:line] description → fix

## Important (should fix)
- [file:line] description → fix

## Minor (nice to have)
- [file:line] description → fix

If the screen looks great and you have NO Critical or Important issues, write only:

# Screen: $screen (Pass $PASS)
## PERFECT — no issues found.

Be honest. If it's good, say so. Don't invent problems to justify your existence." --allowedTools "Bash(readonly),Read,Write"

    echo "Critique written for $screen"

    # Check if critic found issues
    if grep -q "PERFECT" "$CRITIQUE" 2>/dev/null; then
      echo "[$PASS] $screen: PERFECT — skipping fixer"
    else
      FOUND_ISSUES=1

      # Step 2: Fixer implements the changes
      claude -p "You are a frontend developer fixing UI/UX issues in SliceOfPie.

Read $CRITIQUE and implement every fix listed under 'Critical' and 'Important'. Skip 'Minor' unless trivial.

The repo is at $REPO. It's a Vite + TypeScript SPA. Styles are in index.html (inline) or CSS files. Screens are toggled divs.

Rules:
- Only change what the critique calls out. No refactoring, no bonus improvements.
- Don't break other screens.
- If a fix is ambiguous, pick the simplest interpretation.
- After all fixes, append to $CRITIQUE: '## Fixed: [list of what you changed]'" --allowedTools "Bash,Read,Write,Edit"

      echo "[$PASS] Fixes applied for $screen"
    fi
    echo ""
  done

  if [ "$FOUND_ISSUES" -eq 0 ]; then
    echo ""
    echo "######################################"
    echo "  ALL SCREENS PERFECT — STOPPING"
    echo "  Completed in $PASS passes"
    echo "######################################"
    break
  fi

  echo ""
  echo "[$PASS] Issues found this pass — looping for another review..."
  echo ""
done
