# PerplLens

**Real-time trading intelligence and risk analytics for Perpl on Monad.**

PerplLens turns live Perpl market data, Monad mainnet account state, and indexed trading events into a focused analytics layer for traders, researchers, and risk teams.

**Live app:** https://perpllens.vercel.app  
**Network:** Monad Mainnet · Chain ID `143`  
**Perpl Exchange:** `0x34B6552d57a35a1D042CcAe1951BD1C370112a6F`

Built for **Monad Metropolis** — Onchain Finance & Trading.

## Why PerplLens?

Perpetual markets generate plenty of data, but useful risk signals are fragmented across market state, wallet positions, and historical executions.

PerplLens brings those layers together:

- protocol-wide market monitoring
- wallet-level account and position intelligence
- relative market-risk scoring
- historical trade reconstruction
- fee-aware realized PnL analytics
- trader performance metrics

The goal is signal over clutter: start from the protocol, drill into a wallet, then understand both current exposure and realized trading behavior.

## Current Features

### Live Protocol & Market Analytics

PerplLens uses real Perpl market data to surface 24h trading volume, estimated open interest, market TVL, active perpetual markets, mark prices, price movement, funding, and hourly market history.

### Market Risk Intelligence

PerplLens calculates a relative Market Risk Score from four observable signals:

| Signal | Weight |
| --- | ---: |
| Leverage pressure | 30% |
| 24h volatility | 30% |
| Price shock | 25% |
| Funding pressure | 15% |

Risk bands are Low (0–29), Moderate (30–54), High (55–74), and Extreme (75–100).

The score is a relative analytics indicator, not a prediction of liquidation, loss, or future price direction.

### Trader Intelligence

Search a Perpl wallet to inspect its account directly from the Perpl Exchange contract on Monad mainnet.

Current wallet intelligence includes account ID, collateral/available/locked balances, account state, decoded active positions, side, size, collateral, entry price, live mark price, unrealized PnL, and entry block.

This path reads Monad onchain state and does not depend on a private Perpl trading API.

### Historical Trader Analytics

PerplLens includes an Envio-based event indexing and reconstruction pipeline for completed Perpl position lifecycles. The engine processes opens, increases, decreases, closes, inversions, liquidations, and taker fills to calculate:

- net realized PnL
- win rate and profit factor
- best and worst trade
- average holding time
- winning and losing streaks
- Max Realized Drawdown
- completed-trade history

Historical values are never mocked. If the historical index is unreachable, the UI reports **Historical index unavailable** and hides historical metrics while live Monad data remains operational.

## Fee-Aware Trade Reconstruction

A realized trade is more than its price delta. PerplLens reconstructs completed position lifecycles and conservatively attributes taker fills using transaction and log ordering.

```text
Net Realized PnL = Gross Realized PnL + Funding - Attributed Taker Fees
```

Ambiguous fills are not silently assigned. Position inversions are treated as lifecycle boundaries: realized PnL and fees associated with the inversion remain attached to the lifecycle being closed, while the resulting side starts a new lifecycle. Incomplete historical windows remain incomplete rather than receiving invented opening state or holding periods.

## Verified Mainnet Reconstruction

The reconstruction logic has been checked against real Perpl activity on Monad mainnet. One validated lifecycle for Perpl account `5413` produced:

```text
Side:              LONG
Holding time:      252 seconds
Gross realized:    -28 micro-AUSD
Funding:           0
Attributed fees:   6 micro-AUSD
Net realized PnL:  -34 micro-AUSD
```

The reconstructed `-34 micro-AUSD` result matches the observed account balance change for that lifecycle.

Verified mainnet transactions:

- Open: `0xe356ce34838baf34ba10b990ea35c4658db208365833792fd95b473917a72907`
- Close: `0xe10ebd2769e309a08a1e36cb4663210173c30a676d54fec23fe2df9990196539`

## Architecture

```text
                    PerplLens
                 Next.js / Vercel
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
   Perpl Public API  Monad Mainnet  Historical API
   market + candles  contract reads  server route
                                      |
                                      v
                                Envio GraphQL
                                      |
                                      v
                               Lifecycle events
                                      |
                                      v
                           Reconstruction Engine
                                      |
                                      v
                              Trader Analytics
```

### Technology

- Next.js 16 / React 19 / TypeScript / Tailwind CSS
- Recharts
- viem
- Envio
- Monad mainnet

## Data Sources & Monad Integration

### Perpl Public Market API

Used for live protocol metrics and candle history. Server routes normalize protocol values before sending them to the dashboard.

### Perpl Exchange

PerplLens reads account and position state from the Perpl Exchange deployed on Monad mainnet:

```text
0x34B6552d57a35a1D042CcAe1951BD1C370112a6F
```

Monad is not just a deployment target: live wallet intelligence and historical trading events come from Perpl's onchain state and activity on Monad.

### Envio Historical Index

The indexer is configured from Perpl Exchange deployment block `54,773,010` and indexes:

- `AccountCreated`
- `MakerOrderFilledV2`
- `TakerOrderFilledV2`
- `PositionOpenedV2`
- `PositionClosed`
- `PositionIncreasedV2`
- `PositionDecreased`
- `PositionInverted`
- `PositionLiquidated`

The historical UI fails closed when its configured GraphQL endpoint cannot be reached.

## API Routes

| Route | Purpose |
| --- | --- |
| `/api/perpl/markets` | Live Perpl protocol and market metrics |
| `/api/perpl/candles` | Perpl candle history |
| `/api/perpl/wallet` | Monad mainnet wallet/account intelligence |
| `/api/perpl/analytics` | Indexed historical trader analytics |
| `/api/perpl/account` | Server-side authenticated Perpl account integration |

Authenticated Perpl credentials remain server-side and are never intentionally exposed to the browser.

## Run Locally

Requirements: Node.js 20+ and npm.

```bash
git clone https://github.com/zzzyyyddd/perpllens.git
cd perpllens
npm install
npm run dev
```

Open `http://localhost:3000`.

### Environment

Create `.env.local` as needed. Server-side integrations use environment variable names including:

```text
PERPL_API_KEY
PERPL_API_KEY_SECRET
ENVIO_GRAPHQL_URL
```

Never commit API keys or credentials. Historical analytics becomes unavailable when `ENVIO_GRAPHQL_URL` cannot be reached; live public-market and Monad-contract functionality can continue independently.

### Production Validation

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Envio Indexer

The indexer lives in `indexer/` with its configuration, GraphQL schema, ABI, and handlers.

```bash
cd indexer
npm install
npm run codegen
npm run typecheck
```

`ENVIO_API_TOKEN` is used by Envio tooling where required and must remain secret.

## Reliability Principles

1. **Real data over demos** — live features use Perpl or Monad data.
2. **Fail closed** — unavailable historical infrastructure does not become fake zero-value analytics.
3. **Conservative attribution** — ambiguous taker fills are not silently assigned.
4. **Incomplete means incomplete** — truncated history is not reconstructed with invented state.
5. **Server-only secrets** — authenticated API credentials stay outside the client bundle.
6. **Public reproducibility** — source, indexer configuration, analytics logic, and build instructions are public.

## Deployment

The public frontend is deployed on Vercel at https://perpllens.vercel.app.

The live market and Monad onchain paths use remote infrastructure, so the public demo does not require the developer's laptop to remain online. Historical analytics additionally depends on a reachable Envio GraphQL deployment.

## Hackathon Build

PerplLens was built during **Monad Metropolis 2026** as a new project for the **Onchain Finance & Trading** track. The public commit history documents the build across market integration, Monad account decoding, risk intelligence, event indexing, lifecycle reconstruction, fee attribution, trader analytics, historical API, and dashboard UI.

### AI Tool Disclosure

AI-assisted development tools, including ChatGPT, were used for implementation guidance, code generation, debugging, test design, and documentation. Suggested code was integrated and tested by the project builder and, where applicable, validated against real Perpl/Monad data.

## Status

PerplLens is an active hackathon prototype. Live market analytics and Monad wallet intelligence are publicly deployed. The historical analytics engine, API, and UI are implemented; production historical availability depends on a configured and reachable Envio GraphQL deployment.

## License

MIT — see [`LICENSE`](./LICENSE).
