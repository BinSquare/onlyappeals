# OnlyAppeals — Design Document

> A chat-native MCP App that helps San Francisco homeowners build and submit a stronger Prop 8 informal review by turning property facts and comparable sales into a filing-ready evidence packet.

## Problem

San Francisco homeowners overpaying property tax due to inflated assessments face a confusing, form-heavy informal review process. Most don't file because they don't know how to build a defensible case. OnlyAppeals turns that process into a guided, interactive workspace.

## How Prop 8 Informal Review Works (SF Rules)

| Rule | Detail |
|------|--------|
| **What** | Temporary assessed value reduction when market value < factored base year value |
| **Who** | Property owner only (no third-party filings) |
| **Eligible types** | Single-family, condo, townhouse, live-work loft, co-op |
| **Filing window** | January 2 – March 31 |
| **Lien date** | January 1 (market value measured as of this date) |
| **Best evidence** | Comparable neighborhood sales close to Jan 1, no later than March 31 |
| **Submission** | Online portal (preferred), mail, fax, or email |
| **Result** | Mailed in July via Notice of Assessed Value |
| **If denied** | Owner may file formal Assessment Appeal (AAB) |

## Target User

A San Francisco residential property owner who believes their assessed value exceeds current market value and needs help preparing evidence quickly. No tax or legal expertise assumed.

---

## User Flow

### Phase 1: Intake & Eligibility Check

**Collects:**
- Property address / APN
- Property type (SFH, condo, townhouse, live-work, co-op)
- Current assessed value
- Owner's estimate of current market value
- Purchase year (optional context)

**Returns:**
- Eligibility status (property type check)
- Filing window status (is it Jan 2 – Mar 31?)
- Case plausibility signal: **Weak / Medium / Strong** based on gap between assessed and estimated market value

### Phase 2: Comparable Sales Workspace (Primary Widget)

The core interactive experience. The user builds their evidence here.

**Capabilities:**
- View suggested comps (or enter manually)
- Compare by: sale date, price, sqft, beds/baths, distance from subject
- Include/exclude individual comps via toggle
- Add adjustment notes per comp (condition, remodel, location factors)
- Filter comps by distance, date range, or property type

**Constraints enforced:**
- Sales should be close to Jan 1 lien date
- Sales after March 31 are flagged as ineligible
- Minimum 2 comps recommended, 3–5 ideal

### Phase 3: Value Argument Drafting

The model generates a short, neutral narrative covering:
- Assessed value vs. supported market value
- Why selected comps are comparable
- Caveats or weaker points (transparency)
- Recommended owner-declared market value

**User can adjust tone:**
- Shorter / longer
- More formal / more conversational
- More conservative / stronger evidence focus

### Phase 4: Packet Generation & Submission Guide

**Generated packet includes:**
1. Property summary (address, APN, type, assessed value)
2. Comparable sales table
3. Market value opinion with rationale
4. Submission checklist
5. SF submission routes (portal URL, mail/fax/email details)
6. "Keep a copy for your records" reminder

**Export format:** Markdown (with PDF/HTML as stretch goals)

### Phase 5: Post-Filing Guidance

- Results expected in July (Notice of Assessed Value)
- If denied: overview of formal AAB appeal process
- Timeline expectations

---

## MCP Architecture

### Tools

| Tool | Purpose | Widget? |
|------|---------|---------|
| `check-eligibility` | Validate property type, filing window, case plausibility | No (text response) |
| `manage-property` | Store/update subject property facts | No |
| `manage-comps` | Add, edit, remove, toggle comparable sales | Yes: `comp-workspace` |
| `generate-argument` | Draft value rationale from selected comps + property facts | No (text response) |
| `generate-packet` | Produce the full filing-ready packet | Yes: `packet-preview` |
| `get-submission-info` | Return SF submission routes and deadlines | No (text response) |

### Widgets

#### `comp-workspace`
The primary interactive widget. Displays:
- Subject property summary card
- Comparable sales table with include/exclude toggles
- Per-comp adjustment notes
- Case strength indicator (updates live on comp selection changes)
- Distance/date indicators per comp

**Bidirectional interactions:**
- User toggles comp in widget → model recalculates case strength + rewrites rationale
- User asks in chat "only use comps within 0.5 miles" → widget filters table
- User clicks "strengthen argument" → model revises draft text

#### `packet-preview`
Displays the generated packet in a readable format:
- Property summary section
- Comps table
- Value rationale narrative
- Submission checklist with links

### Shared State

```typescript
interface AppState {
  property: {
    address: string;
    apn: string;
    type: "sfh" | "condo" | "townhouse" | "live-work" | "co-op";
    assessedValue: number;
    estimatedMarketValue: number;
    purchaseYear?: number;
    sqft?: number;
    beds?: number;
    baths?: number;
  };
  eligibility: {
    eligible: boolean;
    windowOpen: boolean;
    caseStrength: "weak" | "medium" | "strong";
  };
  comps: Array<{
    id: string;
    address: string;
    saleDate: string;
    salePrice: number;
    sqft: number;
    beds: number;
    baths: number;
    distance: number; // miles from subject
    included: boolean;
    notes: string;
  }>;
  argument: {
    narrative: string;
    declaredMarketValue: number;
    tone: "formal" | "neutral" | "concise";
  };
  packet: {
    generated: boolean;
    content: string; // markdown
  };
}
```

---

## Data Strategy

**Hybrid approach — demo-resilient by design:**

| Data | Source | Fallback |
|------|--------|----------|
| Subject property facts | User input | Required |
| Assessed value | User input (could prefill from public records) | Required from user |
| Comparable sales | Suggested by model / public data | Manual entry (always available) |
| Filing deadlines | Hardcoded (Jan 2 – Mar 31) | N/A |
| Submission routes | Hardcoded from SF official page | N/A |

The app's value is in the **workflow and packet quality**, not data automation. Manual entry must always work.

---

## Hackathon Demo Beats

1. **Eligibility check** — user enters property, gets instant eligibility + case strength
2. **Comp workspace interaction** — toggle comps on/off, watch case strength update live
3. **Chat-to-widget flow** — "only show comps sold after October" filters the widget table
4. **Argument generation** — model drafts rationale, user clicks "make it stronger"
5. **Packet export** — clean, filing-ready document with submission checklist

Minimum 2 visible widget-model bidirectional updates during demo.

---

## Trust & Compliance

- **Disclaimers shown at intake:** informational/document-prep only, not legal advice, no guarantee of reduction
- **Owner responsibility:** user must review and submit themselves
- **Transparency:** all facts labeled as user-provided vs. inferred; weak evidence flagged
- **No third-party filing:** app guides but does not submit on behalf of owner

---

## V1 Scope (Hackathon)

### In Scope
- San Francisco only
- Residential informal review (Prop 8) only
- Guided intake + eligibility
- Interactive comp workspace widget
- Argument drafting with tone control
- Packet generation (Markdown)
- Submission guidance with SF-specific details

### Out of Scope
- Formal AAB appeal filing
- Third-party filing automation
- Legal advice or outcome guarantees
- Multi-county / statewide support
- Automated comp sourcing APIs
- PDF export (stretch goal)

---

## Future Versions

**V2:** Formal AAB appeal support, saved cases, annual re-check reminders, richer evidence quality scoring

**V3:** Multi-county California support, comp sourcing integrations, assessor objection simulation

---

## Current Project State

The codebase is scaffolded with `mcp-use` but contains only the default fruit-search demo. All tools, widgets, and state management need to be built from scratch. The `mcp-use` framework, React 19, Tailwind 4, Zod, and OpenAI Apps SDK UI are already installed and configured.
