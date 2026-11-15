#!/bin/sh
# GitHub Pages serves this branch, so the magic gallery app is copied here from its own branch.
# After updating the app on claude/affectionate-planck-m83nut, run this and push.
git fetch origin claude/affectionate-planck-m83nut && git checkout origin/claude/affectionate-planck-m83nut -- gallery
