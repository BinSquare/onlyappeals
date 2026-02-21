# OnlyAppeals

A chat-native MCP App that helps San Francisco homeowners prepare a Prop 8 informal review (property tax decline-in-value appeal). It turns property facts and comparable sales into a filing-ready evidence packet — no tax expertise required.

## What It Does

1. **Property Lookup** — Enter an address and OnlyAppeals pulls real property data from SF Assessor records (via SF OpenData API)
2. **Eligibility Check** — Validates property type, filing window (Jan 2 – Mar 31), and estimates case strength
3. **Comparable Sales** — Automatically finds recently-sold nearby properties using geo-radius search, with assessed values as sale price proxies (Prop 13 resets)
4. **Interactive Comp Workspace** — Visual widget to review, include/exclude, annotate, and sort comparable sales
5. **Argument Drafting** — Generates a neutral value rationale narrative with adjustable tone (formal, concise, neutral)
6. **Packet Generation** — Produces a filing-ready evidence packet with property summary, comps table, value argument, and submission checklist
7. **Submission Guide** — SF-specific filing routes (online portal, mail, fax, email) with deadlines and instructions

## Tools

| Tool | Description |
|------|-------------|
| `lookup-property` | Search SF Assessor records by address or block/lot |
| `find-comps` | Find comparable sales near the subject property |
| `check-eligibility` | Validate eligibility and assess case strength |
| `manage-property` | Store/update subject property details |
| `manage-comps` | Add, update, remove, or toggle comparable sales |
| `generate-argument` | Draft a value rationale from selected comps |
| `generate-packet` | Produce the full filing-ready packet |
| `export-packet` | Get packet as plain markdown |
| `get-submission-info` | Return SF submission routes and deadlines |

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

- **SF OpenData — Assessor Historical Secured Property Tax Rolls** (`wv5m-vpq2`): Free, no API key required. Provides property details, assessed values, coordinates, and recent sale dates for geo-radius comp search.

## Tech Stack

- [mcp-use](https://mcp-use.com) — MCP server framework
- React 19 + Tailwind 4 — Widget UI
- Zod — Schema validation
- SF OpenData SODA API — Property data

## Deploy

```bash
npm run deploy
```

See [DESIGN.md](DESIGN.md) for the full design document.
