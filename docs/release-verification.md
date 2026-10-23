# Release verification

Version: 0.1.0 (`v0.1.0` Git tag). Verification date: 2026-10-23.

## Installation and compilation

The Git manifest declares `npm ci --omit=dev --ignore-scripts`. The committed lockfile supplies exact production dependency resolution. The plugin still needs Node.js and npm on the coordinator host. No npm package publication is required for Git installation.

A fresh directory containing the runtime entries, client/server/shared sources, manifest, package metadata and lockfile was prepared without development dependencies. Its production dependency installation succeeded. The official Paseo plugin compiler at commit `e08389065c65630993e80c27f4c249a0b0423eb7` compiled the client and server from that directory. The resulting client bundle also compiled with React Native's Windows Hermes compiler. This verifies production dependency preparation and compilation; it is not a complete daemon Git-source acquisition/activation test on another machine.

The installed directory-source plugin was hot reloaded successfully on Paseo 0.11.4. Existing completed local and remote sessions were read through its timeline interface. The main daemon was not restarted. Full clean Git-source lifecycle verification on an isolated daemon remains outstanding.

## Interface and behavior

TypeScript, Biome lint and formatting pass. The affected store test file contains five passing tests, including discussion/run ordering, orphan history visibility and latest-run aggregation. This publication preparation does not claim a new execution of the unchanged coordinator test suite.

Playwright checks against the installed Paseo client covered desktop (1440×1000), narrow desktop (900×844) and phone-width (390×844) layouts. Checks include completed history, desktop side details, narrow-screen details, an accessible composer, draft and expanded-comment retention, actual scroll restoration, management sections and English interface text. These UI checks did not dispatch new model work or alter historical task status. Prior two-host pause/continuation testing is recorded in the repository's QA history.

Native iOS/Android keyboard behavior and a complete native-device matrix have not been verified. Hermes compilation is a compatibility check, not a substitute for device testing.

The compact task toolbar was additionally checked in the isolated sample preview at desktop and phone widths: icon rendering, hover and keyboard-focus hints, detail/member toggles, keyboard activation and long-press hints. Holding the pause control did not dispatch a pause request. The phone-width title retained 262px of width at a 390px viewport, with no horizontal overflow. Native-device long-press behavior still needs device validation. The listing images reflect this toolbar update.

The tag also fixes tooltip stacking after scrolling: the header and its toolbar rows have explicit stacking layers above the discussion while remaining below narrow-screen execution details. The overlap was reproduced before the fix. Playwright checks at 1280px and 390px widths verify the tooltip paints above scrolled comments and execution details still open correctly. Native-device layer behavior has not been independently verified.

## Listing images

`assets/team-discussion-desktop.png` and `assets/team-discussion-mobile.png` render the actual task UI components in an isolated browser preview with fictional data and simulated host SDK responses. The preview never connects to live hosts or invokes models. The selector adapter represents host-provided controls; it is not a full embedded Paseo shell. The sample test output is illustrative, not evidence of a real execution. No live host, project, credential or model information is present.
