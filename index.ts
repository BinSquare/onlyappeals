import { MCPServer, text, markdown, widget, error } from "mcp-use/server";
import { z } from "zod";

const server = new MCPServer({
  name: "OnlyAppeals",
  title: "OnlyAppeals",
  version: "1.0.0",
  description:
    "Helps SF homeowners build and submit a Prop 8 informal review for property tax reduction",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface Property {
  address: string;
  apn: string;
  type: "sfh" | "condo" | "townhouse" | "live-work" | "co-op";
  assessedValue: number;
  estimatedMarketValue: number;
  purchaseYear?: number;
  sqft?: number;
  beds?: number;
  baths?: number;
  lat?: number;
  lng?: number;
  neighborhood?: string;
}

interface Comp {
  id: string;
  address: string;
  saleDate: string;
  salePrice: number;
  sqft: number;
  beds: number;
  baths: number;
  distance: number;
  included: boolean;
  notes: string;
}

interface AppState {
  property: Property | null;
  comps: Comp[];
  argument: {
    narrative: string;
    declaredMarketValue: number;
    tone: "formal" | "neutral" | "concise";
  } | null;
}

const state: AppState = {
  property: null,
  comps: [],
  argument: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ELIGIBLE_TYPES = ["sfh", "condo", "townhouse", "live-work", "co-op"];

function isFilingWindowOpen(): boolean {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  // Jan 2 – Mar 31
  if (month === 0 && day >= 2) return true;
  if (month === 1) return true;
  if (month === 2) return true;
  return false;
}

function calculateCaseStrength(
  assessedValue: number,
  estimatedMarketValue: number
): "weak" | "medium" | "strong" {
  const gap =
    ((assessedValue - estimatedMarketValue) / assessedValue) * 100;
  if (gap >= 15) return "strong";
  if (gap >= 5) return "medium";
  return "weak";
}

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// SF OpenData integration
// ---------------------------------------------------------------------------

const SF_API = "https://data.sfgov.org/resource/wv5m-vpq2.json";
const LATEST_ROLL_YEAR = "2024";

interface SFRecord {
  property_location?: string;
  parcel_number?: string;
  block?: string;
  lot?: string;
  use_code?: string;
  property_class_code_definition?: string;
  year_property_built?: string;
  number_of_bedrooms?: string;
  number_of_bathrooms?: string;
  property_area?: string;
  assessed_land_value?: string;
  assessed_improvement_value?: string;
  current_sales_date?: string;
  assessor_neighborhood?: string;
  the_geom?: { type: string; coordinates: [number, number] };
}

function parseAddress(raw: string): string {
  // SF property_location format examples:
  // "0000 1625 PACIFIC             AV0007"  → "1625 PACIFIC AV #7"
  // "0560 0558 20TH                AV0000"  → "560 20TH AV"
  // "0000 1139D1139BGREEN           ST0000" → "1139 GREEN ST"
  // "0000 0990 GREEN                ST0000"  → "990 GREEN ST"
  //
  // Format: [primary_addr] [secondary_addr] [street_name] [suffix][unit]
  // First 4 digits = primary address number (or 0000 if none)
  // Next 4 digits = secondary/alternate address number
  // Then street name (with irregular spacing), suffix, and unit digits

  const trimmed = raw.trim();
  // Collapse multiple spaces first
  const collapsed = trimmed.replace(/\s+/g, " ").trim();

  // Extract the street suffix to anchor parsing
  const suffixMatch = collapsed.match(
    /^(.+?)\s*(ST|AV|AVE|BLVD|DR|CT|PL|WAY|LN|RD|TER|CIR|HWY)\s*(.*)$/i
  );

  if (suffixMatch) {
    const beforeSuffix = suffixMatch[1];
    const suffix = suffixMatch[2].toUpperCase();
    const afterSuffix = suffixMatch[3];

    // Parse beforeSuffix: extract the first non-zero 4-digit number as the street address
    // Format is typically "NNNN NNNN STREETNAME" where first NNNN is primary address
    const nums = beforeSuffix.match(/\d{4}/g) || [];
    let streetNum = "";
    for (const n of nums) {
      const val = parseInt(n, 10);
      if (val > 0) {
        streetNum = String(val); // strips leading zeros
        break;
      }
    }

    // Extract street name: everything after the last 4-digit number sequence
    let streetName = beforeSuffix.replace(/\d{4}/g, "").trim();
    // Remove junk letter-digit combos (e.g., "D1139B" between numbers and name)
    streetName = streetName.replace(/^[A-Z]?\d+[A-Z]?(?=[A-Z]{3})/i, "");
    streetName = streetName.trim();

    // Parse unit from afterSuffix (e.g., "0007", "0000A", "#301")
    const unit = afterSuffix
      .replace(/^#/, "")
      .replace(/^0+/, "")
      .replace(/[^A-Z0-9]/gi, "");

    const parts = [streetNum, streetName, suffix].filter(Boolean);
    const base = parts.join(" ").replace(/\s+/g, " ");
    return unit ? `${base} #${unit}` : base;
  }

  // Fallback: just clean up
  return collapsed.replace(/^0+(\d)/, "$1");
}

function mapPropertyType(
  classDef: string | undefined
): "sfh" | "condo" | "townhouse" | "live-work" | "co-op" {
  const lower = (classDef ?? "").toLowerCase();
  if (lower.includes("condominium") && lower.includes("live/work"))
    return "live-work";
  if (lower.includes("condominium")) return "condo";
  if (lower.includes("town house")) return "townhouse";
  if (lower.includes("coop")) return "co-op";
  if (lower.includes("flat") || lower.includes("duplex")) return "condo";
  return "sfh"; // Dwelling, PUD, etc.
}

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function querySFData(
  whereClause: string,
  select?: string,
  limit = 10,
  order?: string
): Promise<SFRecord[]> {
  const params = new URLSearchParams({
    $where: whereClause,
    $limit: String(limit),
  });
  if (select) params.set("$select", select);
  if (order) params.set("$order", order);

  const res = await fetch(`${SF_API}?${params}`);
  if (!res.ok) {
    throw new Error(`SF OpenData API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<SFRecord[]>;
}

function recordToProperty(rec: SFRecord, estimatedMarketValue?: number): Property {
  const assessed =
    parseFloat(rec.assessed_land_value ?? "0") +
    parseFloat(rec.assessed_improvement_value ?? "0");
  const coords = rec.the_geom?.coordinates;

  return {
    address: parseAddress(rec.property_location ?? ""),
    apn: rec.parcel_number ?? "",
    type: mapPropertyType(rec.property_class_code_definition),
    assessedValue: Math.round(assessed),
    estimatedMarketValue: estimatedMarketValue ?? Math.round(assessed),
    sqft: parseFloat(rec.property_area ?? "0") || undefined,
    beds: parseFloat(rec.number_of_bedrooms ?? "0") || undefined,
    baths: parseFloat(rec.number_of_bathrooms ?? "0") || undefined,
    purchaseYear: rec.year_property_built
      ? parseInt(rec.year_property_built)
      : undefined,
    lat: coords ? coords[1] : undefined,
    lng: coords ? coords[0] : undefined,
    neighborhood: rec.assessor_neighborhood,
  };
}

// ---------------------------------------------------------------------------
// Tool: lookup-property
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "lookup-property",
    description:
      "Look up a San Francisco property using real SF Assessor data. Searches by street address or block/lot (APN). Auto-populates property details including assessed value, beds, baths, sqft, and neighborhood. ALWAYS call this tool immediately when the user provides an address — no other information is needed upfront.",
    schema: z.object({
      address: z
        .string()
        .optional()
        .describe(
          "Street address to search (e.g., '704 18th St' or '1625 PACIFIC AV'). City/state/zip are stripped automatically. Partial matches work."
        ),
      block: z
        .string()
        .optional()
        .describe("Block number from APN (e.g., '0595')"),
      lot: z
        .string()
        .optional()
        .describe("Lot number from APN (e.g., '139')"),
      estimatedMarketValue: z
        .number()
        .positive()
        .optional()
        .describe(
          "Owner's estimate of current market value. Do NOT ask the user for this — if omitted it defaults to the assessed value. Only provide if the user volunteers it."
        ),
    }),
  },
  async ({ address, block, lot, estimatedMarketValue }) => {
    if (!address && (!block || !lot)) {
      return error("Provide either an address or both block and lot numbers.");
    }

    try {
      let records: SFRecord[];

      if (block && lot) {
        records = await querySFData(
          `block='${block}' AND lot='${lot}' AND closed_roll_year='${LATEST_ROLL_YEAR}'`,
          undefined,
          5
        );
      } else {
        // Normalize address for search
        // SF property_location has irregular spacing (e.g., "0000 1625 PACIFIC             AV0007")
        const normalized = address!
          .toUpperCase()
          .replace(/[#.,]/g, "")
          // Normalize ordinals: 20TH, 3RD, 1ST, 2ND
          .replace(/(\d+)(ST|ND|RD|TH)\b/g, "$1$2")
          .trim();

        // Remove city/state/zip if present
        const cleaned = normalized
          .replace(/\b(SAN\s*FRANCISCO|SF|CA|CALIFORNIA)\b/g, "")
          .replace(/\b\d{5}(-\d{4})?\b/g, "")
          .trim();

        // Split into words, filter out generic street suffixes that match too broadly
        const SUFFIXES = new Set([
          "ST", "AV", "AVE", "BLVD", "DR", "CT", "PL", "WAY",
          "LN", "RD", "TER", "CIR", "HWY", "STREET", "AVENUE",
          "DRIVE", "COURT", "PLACE", "LANE", "ROAD",
        ]);
        const words = cleaned
          .split(/\s+/)
          .filter((w) => w.length > 0 && !SUFFIXES.has(w));

        if (words.length === 0) {
          return error("Could not parse a searchable address. Try '560 20TH' or provide block/lot.");
        }

        const conditions = words
          .map((w) => `property_location like '%${w}%'`)
          .join(" AND ");
        records = await querySFData(
          `${conditions} AND closed_roll_year='${LATEST_ROLL_YEAR}' AND (use_code='SRES' OR use_code='MRES')`,
          undefined,
          10
        );
      }

      if (records.length === 0) {
        return markdown(
          "**No properties found.** Try a different address format (e.g., '1625 PACIFIC AV') or search by block/lot number."
        );
      }

      if (records.length === 1) {
        const prop = recordToProperty(records[0], estimatedMarketValue);
        state.property = prop;

        const lines = [
          "# Property Found\n",
          `**Address:** ${prop.address}`,
          `**APN:** ${prop.apn}`,
          `**Type:** ${prop.type}`,
          `**Neighborhood:** ${prop.neighborhood ?? "Unknown"}`,
          `**Assessed Value:** ${formatCurrency(prop.assessedValue)}`,
          `**Estimated Market Value:** ${formatCurrency(prop.estimatedMarketValue)}`,
          prop.sqft ? `**Size:** ${prop.sqft.toLocaleString()} sqft` : "",
          prop.beds ? `**Beds/Baths:** ${prop.beds}/${prop.baths}` : "",
          `\nProperty saved to your case. You can now run **find-comps** to find nearby comparable sales.`,
        ]
          .filter(Boolean)
          .join("\n");

        return markdown(lines);
      }

      // Multiple results — show options
      const options = records.map((rec) => {
        const p = recordToProperty(rec);
        return `- **${p.address}** (APN: ${p.apn}) — ${p.type}, ${formatCurrency(p.assessedValue)}, ${p.neighborhood ?? ""}`;
      });

      return markdown(
        [
          `# Multiple Properties Found (${records.length})\n`,
          ...options,
          `\nSpecify a more precise address or use block/lot to select one.`,
        ].join("\n")
      );
    } catch (e) {
      return error(
        `Failed to query SF Assessor data: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: find-comps
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "find-comps",
    description:
      "Find comparable recently-sold properties near the subject property using SF Assessor data. Uses geo-radius search and returns properties with recent sale dates. Assessed values after a sale reflect the purchase price under Prop 13.",
    schema: z.object({
      radius: z
        .number()
        .positive()
        .default(0.5)
        .describe("Starting search radius in miles (auto-expands up to 2mi if needed)"),
      monthsBack: z
        .number()
        .positive()
        .default(24)
        .describe("How many months back to search for sales (default 24)"),
      limit: z
        .number()
        .positive()
        .default(15)
        .describe("Maximum number of comps to return (default 15)"),
    }),
    widget: {
      name: "comp-workspace",
      invoking: "Searching for comparable sales...",
      invoked: "Comparable sales found",
    },
  },
  async ({ radius, monthsBack, limit }) => {
    if (!state.property) {
      return error(
        "No subject property set. Use lookup-property or manage-property first."
      );
    }

    if (!state.property.lat || !state.property.lng) {
      return error(
        "Subject property has no coordinates. Use lookup-property to search with SF Assessor data."
      );
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    // Auto-expand radius if no results found (try up to 2 miles)
    const radiiToTry = [radius];
    if (radius < 0.75) radiiToTry.push(0.75);
    if (radius < 1.0) radiiToTry.push(1.0);
    if (radius < 1.5) radiiToTry.push(1.5);
    if (radius < 2.0) radiiToTry.push(2.0);

    let records: SFRecord[] = [];
    let usedRadius = radius;

    try {
      for (const r of radiiToTry) {
        const radiusMeters = Math.round(r * 1609.34);
        records = await querySFData(
          `within_circle(the_geom, ${state.property.lat}, ${state.property.lng}, ${radiusMeters}) AND (use_code='SRES' OR use_code='MRES') AND closed_roll_year='${LATEST_ROLL_YEAR}' AND current_sales_date IS NOT NULL AND current_sales_date > '${cutoffStr}' AND parcel_number != '${state.property.apn}'`,
          undefined,
          limit,
          "current_sales_date DESC"
        );
        usedRadius = r;
        if (records.length > 0) break;
      }

      if (records.length === 0) {
        return widget({
          props: {
            property: state.property,
            comps: state.comps,
            caseStrength: calculateCaseStrength(
              state.property.assessedValue,
              state.property.estimatedMarketValue
            ),
          },
          output: text(
            `No comparable sales found within 2 miles in the last ${monthsBack} months. Try increasing monthsBack or add comps manually.`
          ),
        });
      }

      // Convert records to comps
      const newComps: Comp[] = records
        .filter((rec) => {
          const assessed =
            parseFloat(rec.assessed_land_value ?? "0") +
            parseFloat(rec.assessed_improvement_value ?? "0");
          return assessed > 0;
        })
        .map((rec) => {
          const assessed =
            parseFloat(rec.assessed_land_value ?? "0") +
            parseFloat(rec.assessed_improvement_value ?? "0");
          const coords = rec.the_geom?.coordinates;
          const dist =
            coords && state.property?.lat && state.property?.lng
              ? haversineDistance(
                  state.property.lat,
                  state.property.lng,
                  coords[1],
                  coords[0]
                )
              : 0;

          return {
            id: `comp-${rec.parcel_number ?? Date.now()}`,
            address: parseAddress(rec.property_location ?? ""),
            saleDate: rec.current_sales_date
              ? rec.current_sales_date.split("T")[0]
              : "",
            salePrice: Math.round(assessed),
            sqft: parseFloat(rec.property_area ?? "0"),
            beds: parseFloat(rec.number_of_bedrooms ?? "0"),
            baths: parseFloat(rec.number_of_bathrooms ?? "0"),
            distance: Math.round(dist * 100) / 100,
            included: true,
            notes: rec.property_class_code_definition ?? "",
          };
        });

      // Add to state (avoid duplicates by APN)
      const existingIds = new Set(state.comps.map((c) => c.id));
      for (const comp of newComps) {
        if (!existingIds.has(comp.id)) {
          state.comps.push(comp);
        }
      }

      const included = state.comps.filter((c) => c.included);
      const avgPrice =
        included.length > 0
          ? included.reduce((s, c) => s + c.salePrice, 0) / included.length
          : state.property.estimatedMarketValue;
      const caseStrength = calculateCaseStrength(
        state.property.assessedValue,
        avgPrice
      );

      return widget({
        props: {
          property: state.property,
          comps: state.comps,
          caseStrength,
        },
        output: text(
          `Found ${newComps.length} comparable sales within ${usedRadius} miles${usedRadius > radius ? ` (expanded from ${radius} mi)` : ""}. ${state.comps.length} total comps, case strength: ${caseStrength}. Assessed values shown reflect post-sale reassessment under Prop 13 (proxy for sale price).`
        ),
      });
    } catch (e) {
      return error(
        `Failed to search for comps: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: check-eligibility
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "check-eligibility",
    description:
      "Check if a San Francisco property is eligible for Prop 8 informal review. Returns eligibility status, filing window status, and case strength estimate.",
    schema: z.object({
      propertyType: z
        .enum(["sfh", "condo", "townhouse", "live-work", "co-op"])
        .describe(
          "Property type: sfh (single-family home), condo, townhouse, live-work, or co-op"
        ),
      assessedValue: z
        .number()
        .positive()
        .describe("Current assessed value from tax bill"),
      estimatedMarketValue: z
        .number()
        .positive()
        .describe("Owner's estimate of current market value as of Jan 1"),
    }),
  },
  async ({ propertyType, assessedValue, estimatedMarketValue }) => {
    const eligible = ELIGIBLE_TYPES.includes(propertyType);
    const windowOpen = isFilingWindowOpen();
    const strength = calculateCaseStrength(assessedValue, estimatedMarketValue);
    const gap = assessedValue - estimatedMarketValue;
    const gapPct = ((gap / assessedValue) * 100).toFixed(1);

    const lines = [
      "# Prop 8 Eligibility Check\n",
      `**Property Type:** ${propertyType} — ${eligible ? "Eligible" : "Not eligible"}`,
      `**Filing Window:** ${windowOpen ? "Open (Jan 2 – Mar 31)" : "Currently closed"}`,
      `**Assessed Value:** ${formatCurrency(assessedValue)}`,
      `**Estimated Market Value:** ${formatCurrency(estimatedMarketValue)}`,
      `**Gap:** ${formatCurrency(gap)} (${gapPct}%)`,
      `**Case Strength:** ${strength.toUpperCase()}\n`,
    ];

    if (!eligible) {
      lines.push(
        "This property type is not eligible for SF informal review. Eligible types: single-family home, condo, townhouse, live-work loft, co-op."
      );
    } else if (!windowOpen) {
      lines.push(
        "The filing window is currently closed. Informal review requests are accepted January 2 through March 31."
      );
    } else if (estimatedMarketValue >= assessedValue) {
      lines.push(
        "Your estimated market value is at or above the assessed value. A Prop 8 reduction requires market value to be **below** the factored base year value."
      );
    } else {
      lines.push(
        "Your property appears eligible. Next step: set up your property details and start gathering comparable sales."
      );
    }

    return markdown(lines.join("\n"));
  }
);

// ---------------------------------------------------------------------------
// Tool: manage-property
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "manage-property",
    description:
      "Store or update the subject property details for the informal review case.",
    schema: z.object({
      address: z.string().describe("Property street address"),
      apn: z.string().describe("Assessor Parcel Number"),
      type: z
        .enum(["sfh", "condo", "townhouse", "live-work", "co-op"])
        .describe("Property type"),
      assessedValue: z
        .number()
        .positive()
        .describe("Current assessed value"),
      estimatedMarketValue: z
        .number()
        .positive()
        .describe("Owner's estimate of current market value as of Jan 1"),
      purchaseYear: z
        .number()
        .optional()
        .describe("Year the property was purchased"),
      sqft: z.number().optional().describe("Square footage"),
      beds: z.number().optional().describe("Number of bedrooms"),
      baths: z.number().optional().describe("Number of bathrooms"),
    }),
  },
  async (input) => {
    state.property = { ...input };
    return text(
      `Property saved: ${input.address} (APN: ${input.apn}). Assessed at ${formatCurrency(input.assessedValue)}, estimated market value ${formatCurrency(input.estimatedMarketValue)}.`
    );
  }
);

// ---------------------------------------------------------------------------
// Tool: manage-comps
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "manage-comps",
    description:
      "Add, update, remove, or toggle comparable sales. Returns the updated comp workspace widget.",
    schema: z.object({
      action: z
        .enum(["add", "update", "remove", "toggle", "list"])
        .describe("Action to perform on comps"),
      comp: z
        .object({
          id: z.string().optional().describe("Comp ID (required for update/remove/toggle)"),
          address: z.string().optional().describe("Comp property address"),
          saleDate: z
            .string()
            .optional()
            .describe("Sale date (YYYY-MM-DD)"),
          salePrice: z.number().optional().describe("Sale price"),
          sqft: z.number().optional().describe("Square footage"),
          beds: z.number().optional().describe("Bedrooms"),
          baths: z.number().optional().describe("Bathrooms"),
          distance: z
            .number()
            .optional()
            .describe("Distance from subject property in miles"),
          notes: z
            .string()
            .optional()
            .describe("Adjustment notes (condition, remodel, location)"),
        })
        .optional()
        .describe("Comparable sale data"),
    }),
    widget: {
      name: "comp-workspace",
      invoking: "Updating comparables...",
      invoked: "Comparables updated",
    },
  },
  async ({ action, comp }) => {
    if (action === "add") {
      if (!comp || !comp.address || !comp.salePrice || !comp.saleDate) {
        return error(
          "To add a comp, provide at least address, saleDate, and salePrice."
        );
      }
      const newComp: Comp = {
        id: `comp-${Date.now()}`,
        address: comp.address,
        saleDate: comp.saleDate,
        salePrice: comp.salePrice,
        sqft: comp.sqft ?? 0,
        beds: comp.beds ?? 0,
        baths: comp.baths ?? 0,
        distance: comp.distance ?? 0,
        included: true,
        notes: comp.notes ?? "",
      };
      state.comps.push(newComp);
    }

    if (action === "update" && comp?.id) {
      const idx = state.comps.findIndex((c) => c.id === comp.id);
      if (idx === -1) return error(`Comp not found: ${comp.id}`);
      state.comps[idx] = { ...state.comps[idx], ...comp } as Comp;
    }

    if (action === "remove" && comp?.id) {
      const idx = state.comps.findIndex((c) => c.id === comp.id);
      if (idx === -1) return error(`Comp not found: ${comp.id}`);
      state.comps.splice(idx, 1);
    }

    if (action === "toggle" && comp?.id) {
      const found = state.comps.find((c) => c.id === comp.id);
      if (!found) return error(`Comp not found: ${comp.id}`);
      found.included = !found.included;
    }

    const included = state.comps.filter((c) => c.included);
    const caseStrength = state.property
      ? calculateCaseStrength(
          state.property.assessedValue,
          included.length > 0
            ? included.reduce((sum, c) => sum + c.salePrice, 0) /
                included.length
            : state.property.estimatedMarketValue
        )
      : "weak";

    return widget({
      props: {
        property: state.property,
        comps: state.comps,
        caseStrength,
      },
      output: text(
        `${state.comps.length} comps total, ${included.length} included. Case strength: ${caseStrength}.`
      ),
    });
  }
);

// ---------------------------------------------------------------------------
// Tool: generate-argument
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "generate-argument",
    description:
      "Draft a value argument narrative based on the subject property and selected comparable sales. Returns markdown text the owner can use in their filing.",
    schema: z.object({
      tone: z
        .enum(["formal", "neutral", "concise"])
        .default("neutral")
        .describe("Tone for the argument narrative"),
      declaredMarketValue: z
        .number()
        .positive()
        .optional()
        .describe(
          "Owner's declared market value. If omitted, uses average of included comps."
        ),
    }),
  },
  async ({ tone, declaredMarketValue }) => {
    if (!state.property) {
      return error(
        "No property on file. Use manage-property first to set up the subject property."
      );
    }

    const included = state.comps.filter((c) => c.included);
    if (included.length === 0) {
      return error(
        "No comparable sales selected. Add comps with manage-comps first."
      );
    }

    const avgCompPrice =
      included.reduce((s, c) => s + c.salePrice, 0) / included.length;
    const declared = declaredMarketValue ?? Math.round(avgCompPrice);
    const gap = state.property.assessedValue - declared;
    const gapPct = ((gap / state.property.assessedValue) * 100).toFixed(1);

    const compLines = included
      .map(
        (c, i) =>
          `${i + 1}. **${c.address}** — Sold ${c.saleDate} for ${formatCurrency(c.salePrice)} (${c.sqft} sqft, ${c.beds}bd/${c.baths}ba, ${c.distance} mi)${c.notes ? ` — ${c.notes}` : ""}`
      )
      .join("\n");

    let narrative: string;

    if (tone === "formal") {
      narrative = [
        `# Informal Review — Value Argument\n`,
        `## Subject Property`,
        `- **Address:** ${state.property.address}`,
        `- **APN:** ${state.property.apn}`,
        `- **Property Type:** ${state.property.type}`,
        `- **Current Assessed Value:** ${formatCurrency(state.property.assessedValue)}`,
        `- **Owner's Opinion of Market Value (as of Jan 1):** ${formatCurrency(declared)}\n`,
        `## Basis for Requested Reduction`,
        `The current assessed value of ${formatCurrency(state.property.assessedValue)} exceeds the fair market value of the subject property as of the January 1 lien date. Based on ${included.length} comparable neighborhood sales, the estimated market value is ${formatCurrency(declared)}, representing a ${gapPct}% decline from the assessed value.\n`,
        `## Comparable Sales Evidence`,
        compLines,
        `\n## Conclusion`,
        `The comparable sales data supports a market value of ${formatCurrency(declared)} as of January 1. I respectfully request that the assessed value be reduced to reflect the current market conditions.`,
      ].join("\n");
    } else if (tone === "concise") {
      narrative = [
        `**Property:** ${state.property.address} (APN: ${state.property.apn})`,
        `**Assessed:** ${formatCurrency(state.property.assessedValue)} | **Market Value:** ${formatCurrency(declared)} | **Gap:** ${gapPct}%\n`,
        `**Comps:**`,
        compLines,
        `\nBased on these sales, market value is ${formatCurrency(declared)}. Requesting reduction.`,
      ].join("\n");
    } else {
      narrative = [
        `# Value Argument for ${state.property.address}\n`,
        `My property at ${state.property.address} (APN: ${state.property.apn}) is currently assessed at ${formatCurrency(state.property.assessedValue)}. Based on recent comparable sales in the neighborhood, I believe the market value as of January 1 is ${formatCurrency(declared)}, which is ${gapPct}% below the assessed value.\n`,
        `## Comparable Sales`,
        compLines,
        `\nThe average sale price of these comparable properties is ${formatCurrency(Math.round(avgCompPrice))}. I am requesting that my assessed value be reduced to ${formatCurrency(declared)} to reflect current market conditions.`,
      ].join("\n");
    }

    state.argument = { narrative, declaredMarketValue: declared, tone };

    return markdown(narrative);
  }
);

// ---------------------------------------------------------------------------
// Packet builder (shared by generate-packet and export-packet)
// ---------------------------------------------------------------------------

function buildPacketMarkdown(
  property: Property,
  included: Comp[],
  argument: NonNullable<AppState["argument"]>,
  caseStrength: string,
  avgCompPrice: number
): string {
  const gap = property.assessedValue - argument.declaredMarketValue;
  const gapPct = ((gap / property.assessedValue) * 100).toFixed(1);
  const windowOpen = isFilingWindowOpen();

  const compRows = included
    .map(
      (c) =>
        `| ${c.address} | ${c.saleDate} | ${formatCurrency(c.salePrice)} | ${c.sqft.toLocaleString()} | ${c.beds}/${c.baths} | ${c.distance} mi | ${c.notes || "—"} |`
    )
    .join("\n");

  return [
    `# Prop 8 Informal Review — Filing Packet`,
    `\n## Subject Property`,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Address** | ${property.address} |`,
    `| **APN** | ${property.apn} |`,
    `| **Property Type** | ${property.type} |`,
    property.neighborhood ? `| **Neighborhood** | ${property.neighborhood} |` : "",
    `| **Current Assessed Value** | ${formatCurrency(property.assessedValue)} |`,
    `| **Declared Market Value** | ${formatCurrency(argument.declaredMarketValue)} |`,
    `| **Reduction Requested** | ${formatCurrency(gap)} (${gapPct}%) |`,
    `| **Case Strength** | ${caseStrength.toUpperCase()} |`,
    property.sqft ? `| **Size** | ${property.sqft.toLocaleString()} sqft |` : "",
    property.beds ? `| **Beds/Baths** | ${property.beds}/${property.baths} |` : "",
    `\n## Comparable Sales Evidence`,
    `| Address | Sale Date | Price | Sqft | Bed/Bath | Distance | Notes |`,
    `|---------|-----------|-------|------|----------|----------|-------|`,
    compRows,
    `\n**Average Comparable Sale Price:** ${formatCurrency(avgCompPrice)}`,
    `\n## Value Argument`,
    argument.narrative,
    `\n## Submission Checklist`,
    `- [ ] Review all property details above for accuracy`,
    `- [ ] Verify comparable sales are appropriate`,
    `- [ ] Review value argument narrative`,
    `- [ ] Submit via one of the methods below`,
    `- [ ] Keep a copy of everything you submit`,
    `\n## How to Submit`,
    `**Filing Window:** ${windowOpen ? "OPEN (Jan 2 – Mar 31)" : "CLOSED"}`,
    `\n### Online (Preferred)`,
    `SF Assessor-Recorder Community Portal: https://sfassessor.org/community-portal`,
    `\n### By Mail`,
    `Office of the Assessor-Recorder, City Hall, Room 190`,
    `1 Dr. Carlton B. Goodlett Place, San Francisco, CA 94102`,
    `\n### By Fax`,
    `(415) 554-7151`,
    `\n### By Email`,
    `assessor@sfgov.org`,
    `\n## Important Reminders`,
    `- Only the property **owner** may file (no third-party filings)`,
    `- Comparable sales should be as close to January 1 as possible`,
    `- Sales after March 31 will **not** be considered`,
    `- Results are mailed in **July** via Notice of Assessed Value`,
    `- If denied, you may file a formal Assessment Appeal (AAB)`,
    `\n---`,
    `*This packet was prepared using OnlyAppeals. It provides informational and document-preparation support only — not legal or tax advice. No guarantee of assessment reduction is made or implied.*`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Tool: generate-packet
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "generate-packet",
    description:
      "Generate the complete filing-ready informal review packet with property summary, comps table, value rationale, and submission guide. Returns both a visual widget preview and the full packet as markdown text.",
    schema: z.object({}),
    widget: {
      name: "packet-preview",
      invoking: "Generating filing packet...",
      invoked: "Filing packet ready",
    },
  },
  async () => {
    if (!state.property) {
      return error("No property on file. Use lookup-property or manage-property first.");
    }

    const included = state.comps.filter((c) => c.included);
    if (included.length === 0) {
      return error("No comparable sales selected. Use find-comps or manage-comps first.");
    }

    if (!state.argument) {
      return error(
        "No value argument drafted. Use generate-argument first."
      );
    }

    const avgCompPrice = Math.round(
      included.reduce((s, c) => s + c.salePrice, 0) / included.length
    );
    const caseStrength = calculateCaseStrength(
      state.property.assessedValue,
      state.argument.declaredMarketValue
    );

    const packetMd = buildPacketMarkdown(
      state.property,
      included,
      state.argument,
      caseStrength,
      avgCompPrice
    );

    return widget({
      props: {
        property: state.property,
        comps: included,
        argument: state.argument,
        caseStrength,
        avgCompPrice,
        filingWindowOpen: isFilingWindowOpen(),
      },
      output: markdown(packetMd),
    });
  }
);

// ---------------------------------------------------------------------------
// Tool: export-packet
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "export-packet",
    description:
      "Export the filing packet as plain markdown text that can be copied, saved, or pasted into the SF portal. Use this after generate-packet to get the full text content.",
    schema: z.object({}),
  },
  async () => {
    if (!state.property) {
      return error("No property on file. Build your case first.");
    }
    const included = state.comps.filter((c) => c.included);
    if (included.length === 0) {
      return error("No comparable sales selected.");
    }
    if (!state.argument) {
      return error("No value argument drafted. Use generate-argument first.");
    }

    const avgCompPrice = Math.round(
      included.reduce((s, c) => s + c.salePrice, 0) / included.length
    );
    const caseStrength = calculateCaseStrength(
      state.property.assessedValue,
      state.argument.declaredMarketValue
    );

    return markdown(
      buildPacketMarkdown(state.property, included, state.argument, caseStrength, avgCompPrice)
    );
  }
);

// ---------------------------------------------------------------------------
// Tool: get-submission-info
// ---------------------------------------------------------------------------

server.tool(
  {
    name: "get-submission-info",
    description:
      "Get San Francisco submission routes, deadlines, and post-filing guidance for Prop 8 informal review.",
    schema: z.object({}),
  },
  async () => {
    const windowOpen = isFilingWindowOpen();

    const info = [
      "# SF Prop 8 Informal Review — Submission Guide\n",
      `## Filing Window`,
      `**Status:** ${windowOpen ? "OPEN" : "CLOSED"}`,
      `**Dates:** January 2 – March 31`,
      `**Lien Date:** January 1 (market value measured as of this date)\n`,
      `## Submission Options\n`,
      `### Online (Preferred)`,
      `Submit via the SF Assessor-Recorder Community Portal:`,
      `https://sfassessor.org/community-portal\n`,
      `### By Mail`,
      `Office of the Assessor-Recorder`,
      `City Hall, Room 190`,
      `1 Dr. Carlton B. Goodlett Place`,
      `San Francisco, CA 94102\n`,
      `### By Fax`,
      `(415) 554-7151\n`,
      `### By Email`,
      `assessor@sfgov.org\n`,
      `## Important Rules`,
      `- Only the property **owner** may file (no third-party filings)`,
      `- Include comparable sales as close to January 1 as possible`,
      `- Sales after March 31 will **not** be considered`,
      `- Keep a copy of everything you submit\n`,
      `## After Filing`,
      `- Results are mailed in **July** via Notice of Assessed Value`,
      `- If you disagree with the result, you may file a **formal Assessment Appeal** with the Assessment Appeals Board (AAB)`,
      `- AAB filing has its own deadline — watch for it in the Notice\n`,
      `## Disclaimer`,
      `This tool provides informational and document-preparation support only. It does not constitute legal or tax advice. No guarantee of assessment reduction is made or implied. The property owner is responsible for reviewing and submitting all materials.`,
    ].join("\n");

    return markdown(info);
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

server.listen().then(() => {
  console.log("OnlyAppeals server running");
});
