<p align="center">
  <img src="onlyappeals_logo.png" alt="OnlyAppeals" width="400">
</p>

# OnlyAppeals

A chat-native MCP App that helps homeowners in **San Francisco** and **Cook County (Chicago)** prepare property tax appeal packets. It turns property facts and comparable sales into a filing-ready evidence packet — no tax expertise required.

## What It Does

1. **Property Lookup** — Enter an address and OnlyAppeals pulls real property data from Assessor records (SF OpenData / Cook County Open Data)
2. **Eligibility Check** — Validates property type, filing window, and estimates case strength
3. **Comparable Sales** — Automatically finds recently-sold nearby properties using geo-radius search
4. **Interactive Comp Workspace** — Visual widget to review, include/exclude, annotate, and sort comparable sales
5. **Argument Drafting** — Generates a neutral value rationale narrative with adjustable tone (formal, concise, neutral)
6. **Packet Generation** — Produces a filing-ready evidence packet with property summary, comps table, value argument, and submission checklist
7. **Submission Guide** — City-specific filing routes (online portal, mail, fax, email) with deadlines and instructions

## Supported Cities

| City | Data Source | Appeal Type | Sale Price Data |
|------|------------|-------------|-----------------|
| **San Francisco** | SF OpenData (Assessor Tax Rolls) | Prop 8 Informal Review | Assessed value proxy (Prop 13) |
| **Cook County (Chicago)** | Cook County Open Data (5 datasets) | Property Tax Appeal | Actual sale prices |

## Tools

| Tool | Description |
|------|-------------|
| `lookup-property` | Search Assessor records by address, block/lot (SF), or PIN (Cook County) |
| `find-comps` | Find comparable sales near the subject property |
| `check-eligibility` | Validate eligibility and assess case strength |
| `manage-property` | Store/update subject property details |
| `manage-comps` | Add, update, remove, or toggle comparable sales |
| `generate-argument` | Draft a value rationale from selected comps |
| `generate-packet` | Produce the full filing-ready packet |
| `export-packet` | Get packet as plain markdown |
| `get-submission-info` | Return submission routes and deadlines |

## Widgets

- **Comp Workspace** — Interactive comparable sales table with include/exclude toggles, notes, sorting, and case strength indicator
- **Packet Preview** — Tabbed view of the generated packet (Summary, Comps, Argument, Submit)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000/inspector](http://localhost:3000/inspector) to test.

## Data Sources

- **SF OpenData — Assessor Historical Secured Property Tax Rolls** (`wv5m-vpq2`): Free, no API key required.
- **Cook County Open Data** — Parcel Addresses (`3723-97qp`), Characteristics (`x54s-btds`), Assessed Values (`uzyt-m557`), Parcel Sales (`wvhk-k5uv`), Parcel Universe (`nj4t-kc8j`): Free, no API key required.

## Tech Stack

- [mcp-use](https://mcp-use.com) — MCP server framework
- React 19 + Tailwind 4 — Widget UI
- Zod — Schema validation
- Socrata SODA API — Property data (both cities)

## Deploy

```bash
npm run deploy
```

See [DESIGN.md](DESIGN.md) for the full design document.
