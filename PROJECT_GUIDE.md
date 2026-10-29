# IPL Fuzzy Auction Value Simulator

An offline, browser-based academic demonstration of a fuzzy inference system for estimating hypothetical IPL auction values. It uses player-role statistics, perceived team demand, and a consistency score to produce an illustrative price in ₹ crore.

## Run the model

1. Open a terminal in this project folder and run **node server.mjs**.
2. Open **http://127.0.0.1:4173** in a browser.
3. Sign in with the classroom demo account shown on the login page (**analyst@ipl.demo** / **IPL2026!**).
4. Use **Player valuation** to enter a role and season-level statistics. Review the estimate, memberships, and rule trace, then save it.
5. Open **Saved valuations** to search and delete saved estimates, **Compare players** to compare saved profiles, and **Fuzzy rulebook** to inspect all 27 rules.

The project uses only Node.js built-ins; it has no package installation or external library dependency. The server creates **data/store.json** on first launch and persists saved valuations there.

## Concepts used

### 1. Fuzzy sets and membership functions

In classical logic, a value is either in a category or out of it. Fuzzy logic allows partial membership. For example, a performance score of 65 can be partly **Medium** and partly **High** at the same time.

The model fuzzifies three normalized inputs on a 0–100 scale:

- **Performance**: calculated from role-specific statistics.
- **Demand**: the user's estimate of bidding interest across teams.
- **Consistency**: the user's scouting score for repeatability and availability.

Each input has overlapping **Low**, **Medium**, and **High** fuzzy sets:

- Low: trapezoid with points [0, 0, 25, 45]
- Medium: triangle with points [25, 50, 75]
- High: trapezoid with points [55, 75, 100, 100]

For a triangular set (a, b, c), membership rises linearly from 0 at a to 1 at b, then falls to 0 at c. A trapezoidal set (a, b, c, d) rises from a to b, remains 1 from b to c, then falls to 0 at d. The membership value is written as μ(x) and lies between 0 and 1.

The output variable is auction value from ₹0.20 crore to ₹30 crore, represented by four overlapping fuzzy sets:

- Low: trapezoid [0.2, 0.2, 1.5, 5.0]
- Fair: triangle [3.0, 8.0, 13.0]
- High: triangle [9.0, 16.0, 23.0]
- Premium: trapezoid [18.0, 24.0, 30.0, 30.0]

### 2. Role-specific normalization

The app first maps statistics to 0–100 using a clipped linear scale:

**normalize(x; low, high) = clamp((x - low) / (high - low) × 100, 0, 100)**

The ranges are heuristic demonstration values, not official league benchmarks.

- **Batter**: 0.55 × batting-average score + 0.45 × strike-rate score
  - Average: 15 to 55 runs
  - Strike rate: 100 to 180
- **Bowler**: 0.55 × wickets score + 0.45 × economy score
  - Wickets: 0 to 30
  - Economy score maps economy rates 10 to 5 in reverse, so a lower economy earns a higher score
- **All-rounder**: average of the batter and bowler scores above
- **Wicketkeeper-batter**: 0.75 × batting score + 0.25 × keeping-impact score

The keeping-impact score is entered directly on a 0–100 scouting scale.

### 3. Mamdani fuzzy inference

The rule base contains 27 rules: every combination of three performance sets, three demand sets, and three consistency sets. A rule has the form:

> IF performance is High AND demand is Medium AND consistency is High THEN auction value is High.

The AND operator is the **minimum** of the three input membership degrees. Each rule clips its consequent output set at that firing strength. Consequents from all fired rules are combined with the **maximum** operator (Mamdani aggregation).

To keep the rule base systematic and inspectable, the consequent for each combination is generated from representative set centers:

| Input set | Representative value |
|---|---:|
| Low | 18 |
| Medium | 50 |
| High | 82 |

The rule score is:

**0.65 × performance center + 0.22 × demand center + 0.13 × consistency center**

It maps to the output sets as follows:

| Rule score | Consequent |
|---:|---|
| Below 26 | Low |
| 26 to below 48 | Fair |
| 48 to below 70 | High |
| 70 or higher | Premium |

Performance receives the greatest weight because the main purpose is to estimate player value from playing ability. Demand and consistency modify the estimate. These weights and thresholds are chosen for a clear classroom demonstration. The historical auction data included in this version is for comparison only; it has not been used to calibrate the fuzzy rules.

### 4. Centroid defuzzification

The aggregated fuzzy output does not yet give one price. The model uses the **centroid (center of area)** method:

**price = Σ(xᵢ × μaggregate(xᵢ)) / Σ(μaggregate(xᵢ))**

The browser approximates the area using points from ₹0.20 crore to ₹30.00 crore at ₹0.10 crore intervals. The selected base price is then applied as a floor:

**final estimate = max(centroid price, selected base price)**

The output category is the Low/Fair/High/Premium set with the greatest membership in the aggregated output.

## System design

### Inputs

- Player name (display only)
- Primary role
- Role-specific season statistics
- Auction demand (0–100)
- Consistency / reliability (0–100)
- Base price (₹0.20, ₹0.50, ₹1.00, or ₹2.00 crore)

### Processing pipeline

**Profile form → role normalization → fuzzy membership calculation → 27-rule Mamdani inference → max aggregation → centroid defuzzification → base-price floor → result and rule trace**

### Main modules

| Module | Responsibility |
|---|---|
| Role form | Shows only statistics relevant to the selected role |
| Performance scorer | Normalizes and combines role-specific statistics |
| Fuzzifier | Calculates Low/Medium/High membership degrees |
| Rule engine | Evaluates all 27 rules with minimum AND |
| Aggregator | Clips and combines output sets using maximum |
| Defuzzifier | Calculates the centroid over the output price range |
| Result view | Shows the estimated price, category, memberships, and rule trace |
| Auction reference page | Shows actual IPL 2026 sale prices independently of model estimates |
| Login and session API | Verifies the shared demo account and issues an HTTP-only session cookie |
| Valuation API | Saves, lists, and deletes the signed-in analyst's valuation records |
| JSON data store | Persists the demo account and saved valuations between server restarts |
| Static presentation mode | Uses the browser's local storage for demo sign-in and saved valuations on GitHub Pages |

## Frontend, backend, and data storage

- **Frontend:** **index.html** contains the app interface, styling, role scoring, fuzzy inference, and a static presentation mode. The browser runs the fuzzy calculations.
- **Backend:** **server.mjs** is a Node.js server. It serves the app and implements demo login, session cookies, and API routes for saving, listing, and deleting valuations.
- **Data storage:** There is no SQL database. In Node mode, the backend stores the seeded demo account and saved valuation records in **data/store.json** on the host computer. Historical reference records are kept in **auction-data.json**. In GitHub Pages mode, demo login and saved valuations use browser local storage, so saved estimates stay on that device and browser.
- **Temporary form data:** Values being edited in the calculator stay in the browser. When saved, Node mode sends the evaluation to the backend and persists it in **data/store.json**; GitHub Pages mode saves it in this browser's local storage.
- **Project files:** The project code is in the project folder and ZIP archive. The generated **data/store.json** is runtime data and is not part of the code ZIP.

For presentation, the static GitHub Pages deployment serves **index.html** and **auction-data.json** without depending on the local Node server or a temporary tunnel. The public classroom login is a demo gate, not secure production authentication; do not use personal or confidential information. The Node version remains available for local backend and JSON-file demonstrations.

### Preloaded IPL auction reference data

After signing in to the demo account, the Overview and **2026 auction data** page show 10 of the highest-priced players sold in the IPL 2026 auction. The auction took place on 16 December 2025. The reference records include player, country, role, winning franchise, and reported sale price. The auction summary reports 77 players sold, including 29 overseas players, and ₹215.45 crore spent. See the [IPL official auction announcement](https://www.iplt20.com/news/article/tata-ipl-2026-player-auction-list-announced) and [NDTV Sports sold-player list](https://sports.ndtv.com/ipl-2026/auction/soldplayer).

These observed sale prices are historical reference data. They are not stored as fuzzy estimates, are not fed into the rule engine, and have not been used to train or calibrate the model. The calculator's estimate is computed independently from the entered performance statistics, demand, and consistency scores.

## Demonstration plan

1. Load **Example batter** and note the performance score and output category.
2. Increase auction demand while keeping the other values fixed. Observe how demand membership changes the activated rules and price.
3. Lower consistency and observe the same changes in rule activations.
4. Switch to **Example bowler**. The input fields and scoring formula change with the player's role.
5. Raise the base-price floor above the centroid to demonstrate the reserve-price constraint.
6. Expand **View the complete 27-rule base** to inspect the rules used by the inference engine.

## Project objectives

- Demonstrate fuzzy logic on an understandable sports-auction use case.
- Show that linguistic categories can overlap and handle borderline inputs.
- Implement a complete Mamdani inference pipeline in a working interactive model.
- Make each estimate explainable through membership degrees and fired rules.

## Assumptions and limitations

- The output is a hypothetical classroom estimate, not an official IPL price, real-world prediction, or recommendation. Auction reference prices are real historical outcomes and are shown separately.
- Statistics are assumed to be season-level values. Opportunity, sample size, injuries, role scarcity, purse constraints, team strategy, player availability, and auction rules are not modeled.
- Demand and consistency are subjective inputs. The app does not scrape player or auction data at runtime; its backend includes a small fixed set of sourced auction reference records.
- Role normalization ranges, weights, rule thresholds, output sets, and ₹30 crore upper bound are chosen for demonstration, not fitted against an official dataset.
- The price-floor control models a reserve constraint, but the app does not model bidding increments, competing teams, or an auction sequence.
- A research extension could collect historical player-season and auction-price data, tune the ranges and weights, and compare model estimates with held-out seasons using MAE or RMSE.

## Suggested report abstract

This project presents a fuzzy logic-based IPL auction value simulator. It converts role-specific batting and bowling statistics into a normalized performance score and combines performance with team demand and player consistency. Low, medium, and high input fuzzy sets feed a 27-rule Mamdani inference system. The output fuzzy sets are aggregated and converted into a crisp estimate by centroid defuzzification, after which a selected base price is enforced as a floor. The browser model exposes membership degrees and rule activations so that the inference process is observable. The app also provides a sourced sample of IPL 2026 auction prices for historical comparison; those prices are not model inputs. The estimates remain illustrative and use heuristic ranges.

