# Boundary — IPL Fuzzy Auction Intelligence

A classroom web app that demonstrates role-based player scoring and Mamdani fuzzy inference for a hypothetical IPL auction estimate. It also includes a preloaded historical reference table of the 10 highest-priced purchases from the IPL 2026 auction (held 16 December 2025).

**Live presentation demo:** https://satvik10lodha11-lgtm.github.io/ipl-fuzzy-auction-simulator/

## Start

1. Install Node.js if it is not already installed.
2. Open a terminal in this folder.
3. Run **node server.mjs**.
4. Open **http://127.0.0.1:4173**.
5. Sign in with **analyst@ipl.demo** and **IPL2026!**.

The demo account is shared and is not suitable for private or production use.

## App features

- Dashboard with saved valuation totals and recent estimates
- Auction Data page with actual sale prices, franchises, roles, and search
- Role-aware player valuation for batters, bowlers, all-rounders, and wicketkeeper-batters
- Mamdani fuzzy rule trace, membership degrees, and all 27 rules
- Saved valuation history with search and deletion
- Side-by-side comparison of saved players
- Saved estimate history (JSON file locally, browser storage on GitHub Pages)

## Architecture

- **Frontend:** **index.html** contains the interface and fuzzy model. Calculations run in the browser.
- **Backend:** **server.mjs** serves the local version and provides login plus valuation APIs.
- **Auction reference:** **auction-data.json** contains the historical summary and 10 sourced player records used by both hosting modes.
- **Data:** When run with Node, the server creates **data/store.json** and saves valuations there. On the GitHub Pages demo, sign-in and saved valuations use this browser's local storage instead.
- **Historical reference:** The backend seeds the 2026 auction summary and 10 top-buy records. The actual prices are shown separately; they are not inputs to the fuzzy model and are not used to train or calibrate it.

This is a soft-computing demonstration. Score ranges, rule weights, and price sets are heuristics, and the output is not an official IPL price. Historical reference sources: [IPL official auction announcement](https://www.iplt20.com/news/article/tata-ipl-2026-player-auction-list-announced) and [NDTV Sports sold-player list](https://sports.ndtv.com/ipl-2026/auction/soldplayer).

The GitHub Pages version is a static presentation demo: its shared classroom login is only a demo gate, not secure authentication, and saved valuations stay in the browser where they were entered.

