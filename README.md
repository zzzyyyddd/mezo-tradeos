# Mezo TradeOS

**Trustless trade. Real settlement.**

Milestone-based MUSD escrow with on-chain settlement and verifiable IPFS evidence on **Mezo Testnet**.

[Live App](https://mezo-tradeos.vercel.app) · [Source Code](https://github.com/zzzyyyddd/mezo-tradeos) · [Escrow on Mezo Explorer](https://explorer.test.mezo.org/address/0x898c6d497707152f43e15f1180f7aff4b1ec73cf)

## The Problem

Milestone-based transactions are difficult when buyers and sellers do not fully trust each other. Buyers worry about paying before delivery; sellers worry about working without payment. Evidence and dispute decisions are often held by a single platform.

**Mezo TradeOS** makes the payment lifecycle transparent: MUSD is locked in a smart contract, evidence is committed on-chain, and milestone payments follow contract-enforced rules.

## What It Does

- **MUSD escrow:** A buyer creates a trade with seller, resolver, deadline, and milestone amounts, then approves and funds it with MUSD.
- **Milestone settlement:** The seller submits evidence for the active milestone; the buyer can release that milestone's payment.
- **Verifiable IPFS evidence:** Seller-authorized evidence is uploaded to IPFS through Pinata. The app checks retrieved evidence against its on-chain hash commitment.
- **Evidence discovery:** An Upstash Redis registry helps users find the CID for a given trade and milestone. The registry is a convenience layer, **not** the integrity authority.
- **Disputes and refunds:** A designated resolver can settle disputed trades; the contract also provides a refund path for eligible expired trades.
- **Public testnet demo:** The application runs on Vercel, so reviewers can inspect existing trades without running a local server.

## User Flow

```
Buyer creates trade and specifies milestones
                  ↓
Buyer approves MUSD and funds escrow
                  ↓
Seller signs evidence-upload authorization
                  ↓
Evidence is uploaded to IPFS (Pinata)
                  ↓
Seller commits evidence hash on Mezo
                  ↓
Buyer reviews / verifies evidence
                  ↓
Buyer releases milestone payment in MUSD
                  ↓
Next milestone, or Completed
```
Disputes, resolver decisions, and eligible refunds are alternative contract-governed paths.

## Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Network | Mezo Testnet | Smart contract execution and settlement |
| Asset | MUSD | Escrow funding and milestone payouts |
| Contract | Solidity, OpenZeppelin | Escrow state machine and reentrancy protection |
| Frontend | Next.js, React, Tailwind CSS | Buyer/seller/resolver workflow |
| Wallet | wagmi, viem | Wallet connection, signatures, transactions |
| Evidence storage | IPFS via Pinata | Content-addressed evidence documents |
| Evidence lookup | Upstash Redis | Trade/milestone CID registry and API rate limiting |
| Deployment | Vercel | Hosted app and serverless API routes |
| Tests | Hardhat | Contract behavior and security regression tests |

### Evidence Integrity Model

The seller signs an upload authorization. The server validates the request before uploading the evidence document. The application computes the evidence commitment and records it through the escrow contract's `submitMilestone` function. Verification fetches the IPFS content and compares its computed hash with the commitment stored on Mezo.

**Important distinction:** Finding a CID in Redis does not prove the evidence is authentic; the on-chain hash comparison is the integrity check.

## Deployment — Mezo Testnet

| Parameter | Value |
|---|---|
| Chain ID | `31611` |
| RPC | `https://rpc.test.mezo.org` |
| Explorer | `https://explorer.test.mezo.org` |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| TradeEscrow | `0x898c6d497707152f43e15f1180f7aff4b1ec73cf` |
| Deployment block | `16262774` |

[Deployment transaction](https://explorer.test.mezo.org/tx/0x1fcbc99c7305a4b90455c9d3a10f7577ea781d6fc700ccfe225b000b7323dd01)

## Live, Completed Trade — No New Transaction Needed

**Trade #5** was exercised end-to-end using the deployed application on Mezo Testnet:

| Property | Result |
|---|---|
| Trade ID | `5` |
| Status | **Completed** |
| Total escrow | **0.1 MUSD** |
| Released | **0.1 MUSD** |
| Completed milestones | **1** |

The workflow included trade creation, token approval, escrow funding, seller-signed IPFS upload, on-chain evidence submission, CID lookup, evidence verification, and buyer release.

### How Judges Can Inspect It

1. Visit [Mezo TradeOS](https://mezo-tradeos.vercel.app).
2. Connect a wallet on **Mezo Testnet** if the interface requests one. No new trade is needed.
3. Enter **Trade ID `5`** in **Manage Trade** and inspect the **Completed** status and **0.1 MUSD** released.
4. In **IPFS Evidence Verification**, select milestone index **`0`**.
5. Click **Find Evidence CID**, then **Verify Evidence** to compare the retrieved document with the blockchain commitment.

This read-only inspection does not require funding another escrow. To test creating and funding a new trade, users need testnet MUSD and native gas.

## Smart Contract

Main implementation: [`contracts/TradeEscrow.sol`](contracts/TradeEscrow.sol)

| Function | Purpose |
|---|---|
| `createTrade` | Register an agreement and milestone schedule |
| `fundTrade` | Lock buyer MUSD in escrow |
| `submitMilestone` | Record evidence commitment for the active milestone |
| `releaseMilestone` | Release a milestone payment |
| `disputeTrade` | Open a dispute |
| `resolveDispute` | Apply resolver-mediated settlement |
| `refundExpired` | Refund when contract expiry conditions permit |

Emitted events include `TradeCreated`, `TradeFunded`, `MilestoneSubmitted`, `MilestoneReleased`, `TradeDisputed`, `TradeResolved`, and `TradeRefunded`.

## Security and Limitations

- Contract uses OpenZeppelin `ReentrancyGuard`.
- Buyer, seller, and resolver actions are subject to on-chain role and lifecycle checks.
- Evidence upload requires a wallet signature and server-side validation.
- Evidence endpoints use rate limiting; server-side credentials are not included in the repository.
- IPFS content is verified against an on-chain commitment rather than trusted solely because a CID is returned.
- The app uses a **designated resolver** for disputes: it is not a fully trust-free arbitration mechanism.
- IPFS retrieval depends on available gateways/pinning, and CID discovery depends on the hosted registry.

**Status:** Hackathon prototype on **Mezo Testnet**. The contract has not undergone an independent security audit. Do not use this deployment to safeguard real funds.

## Run Locally

Requirements: Node.js, npm, a Mezo Testnet-compatible wallet, and relevant testnet assets for write operations.

### Contract tests

```bash
npm install
npx hardhat test
```
### Frontend

```bash
cd web
npm install
npm run dev
```
Open `http://localhost:3000`.

The evidence upload/lookup API routes require server-side environment variables for Pinata and Upstash Redis. Keep `PINATA_JWT`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` private; never prefix secrets with `NEXT_PUBLIC_` or commit them to Git.

## Repository Layout

```
contracts/       TradeEscrow and test token contracts
test/            Hardhat contract tests
scripts/         Deployment and diagnostic utilities
deployments/     Public Mezo Testnet deployment metadata
web/src/app/     Next.js app and evidence API routes
web/src/lib/     Contract, network, and evidence utilities
web/src/components/  UI components
```
## Why Mezo?

Mezo TradeOS explores **MUSD as a settlement asset for real milestone-based agreements**. Rather than demonstrating a token transfer alone, it shows a complete escrow lifecycle with verifiable deliverables, dispute paths, and transparent settlement history.

---

**Mezo TradeOS — Trustless trade. Real settlement.**
