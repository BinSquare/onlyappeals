import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";
import "../styles.css";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const compSchema = z.object({
  id: z.string(),
  address: z.string(),
  saleDate: z.string(),
  salePrice: z.number(),
  sqft: z.number(),
  beds: z.number(),
  baths: z.number(),
  distance: z.number(),
  included: z.boolean(),
  notes: z.string(),
});

const propertySchema = z
  .object({
    address: z.string(),
    apn: z.string(),
    type: z.string(),
    assessedValue: z.number(),
    estimatedMarketValue: z.number(),
    sqft: z.number().optional(),
    beds: z.number().optional(),
    baths: z.number().optional(),
  })
  .nullable();

const propsSchema = z.object({
  property: propertySchema,
  comps: z.array(compSchema),
  caseStrength: z.enum(["weak", "medium", "strong"]),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive comparable sales workspace for Prop 8 informal review",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type Comp = z.infer<typeof compSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function ppsf(price: number, sqft: number): string {
  if (!sqft) return "—";
  return fmt(Math.round(price / sqft)) + "/sqft";
}

function strengthColor(
  s: "weak" | "medium" | "strong",
  theme: string
): string {
  if (s === "strong") return theme === "dark" ? "#22c55e" : "#16a34a";
  if (s === "medium") return theme === "dark" ? "#eab308" : "#ca8a04";
  return theme === "dark" ? "#ef4444" : "#dc2626";
}

function saleDateWarning(dateStr: string): string | null {
  const d = new Date(dateStr);
  const month = d.getMonth();
  const day = d.getDate();
  // After March 31
  if (month > 2 || (month === 2 && day > 31)) {
    return "Sale after Mar 31 — may not be accepted";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

export default function CompWorkspace() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();

  const { callTool: manageComps } = useCallTool("manage-comps");
  const [sortBy, setSortBy] = useState<"date" | "price" | "distance">("date");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const VISIBLE_COUNT = 5;

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 24 }}>
          <div
            style={{
              height: 20,
              width: 200,
              borderRadius: 4,
              background: theme === "dark" ? "#333" : "#e5e5e5",
              animation: "pulse 1.5s infinite",
            }}
          />
          <div
            style={{
              marginTop: 16,
              height: 120,
              borderRadius: 8,
              background: theme === "dark" ? "#262626" : "#f5f5f5",
              animation: "pulse 1.5s infinite",
            }}
          />
        </div>
      </McpUseProvider>
    );
  }

  const { property, comps, caseStrength } = props;

  const bg = theme === "dark" ? "#1a1a1a" : "#ffffff";
  const cardBg = theme === "dark" ? "#262626" : "#f9fafb";
  const borderColor = theme === "dark" ? "#404040" : "#e5e7eb";
  const textPrimary = theme === "dark" ? "#f3f4f6" : "#111827";
  const textSecondary = theme === "dark" ? "#9ca3af" : "#6b7280";
  const includedBg = theme === "dark" ? "#1e3a2f" : "#f0fdf4";
  const excludedBg = theme === "dark" ? "#2a2020" : "#fef2f2";

  // Sort comps
  const sorted = [...comps].sort((a, b) => {
    if (sortBy === "date") return a.saleDate.localeCompare(b.saleDate);
    if (sortBy === "price") return a.salePrice - b.salePrice;
    return a.distance - b.distance;
  });

  const included = comps.filter((c) => c.included);
  const avgPrice =
    included.length > 0
      ? Math.round(
          included.reduce((s, c) => s + c.salePrice, 0) / included.length
        )
      : 0;

  const handleToggle = (comp: Comp) => {
    manageComps({ action: "toggle", comp: { id: comp.id } });
  };

  const handleRemove = (comp: Comp) => {
    manageComps({ action: "remove", comp: { id: comp.id } });
  };

  const handleSaveNotes = (comp: Comp) => {
    manageComps({
      action: "update",
      comp: { id: comp.id, notes: noteText },
    });
    setEditingNotes(null);
    setNoteText("");
  };

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          padding: 24,
          backgroundColor: bg,
          color: textPrimary,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: textPrimary,
              }}
            >
              Comparable Sales Workspace
            </h2>
            {property && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 14,
                  color: textSecondary,
                }}
              >
                {property.address} — Assessed at {fmt(property.assessedValue)}
              </p>
            )}
          </div>

          {/* Case Strength Badge */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                backgroundColor: strengthColor(caseStrength, theme),
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#fff",
                  opacity: 0.8,
                }}
              />
              {caseStrength.toUpperCase()} CASE
            </div>
            {included.length > 0 && (
              <span style={{ fontSize: 12, color: textSecondary }}>
                Avg comp: {fmt(avgPrice)}
              </span>
            )}
          </div>
        </div>

        {/* Property Summary Card */}
        {property && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: `1px solid ${borderColor}`,
              backgroundColor: cardBg,
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                APN
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{property.apn}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Type
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{property.type}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Assessed
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {fmt(property.assessedValue)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Est. Market
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {fmt(property.estimatedMarketValue)}
              </div>
            </div>
            {property.sqft && (
              <div>
                <div style={{ fontSize: 11, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Size
                </div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {property.sqft.toLocaleString()} sqft
                  {property.beds ? ` · ${property.beds}bd/${property.baths}ba` : ""}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sort Controls + Stats */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {(["date", "price", "distance"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: `1px solid ${sortBy === s ? strengthColor("medium", theme) : borderColor}`,
                  backgroundColor:
                    sortBy === s
                      ? theme === "dark"
                        ? "#3a3520"
                        : "#fefce8"
                      : "transparent",
                  color: sortBy === s ? textPrimary : textSecondary,
                  fontSize: 12,
                  fontWeight: sortBy === s ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                Sort: {s}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: textSecondary }}>
            {comps.length} comps · {included.length} included
          </span>
        </div>

        {/* Comps Table */}
        {sorted.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: textSecondary,
              border: `1px dashed ${borderColor}`,
              borderRadius: 12,
            }}
          >
            <p style={{ fontSize: 16, margin: "0 0 8px", color: textPrimary }}>
              No comparable sales yet
            </p>
            <p style={{ fontSize: 13, margin: 0 }}>
              Ask the AI to add comps, or provide them in chat.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(showAll ? sorted : sorted.slice(0, VISIBLE_COUNT)).map((comp) => {
              const warning = saleDateWarning(comp.saleDate);
              return (
                <div
                  key={comp.id}
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: comp.included ? includedBg : excludedBg,
                    opacity: comp.included ? 1 : 0.7,
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Row 1: address + controls */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => handleToggle(comp)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          border: `2px solid ${comp.included ? strengthColor("strong", theme) : borderColor}`,
                          backgroundColor: comp.included
                            ? strengthColor("strong", theme)
                            : "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: 0,
                        }}
                      >
                        {comp.included ? "✓" : ""}
                      </button>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {comp.address}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => {
                          setEditingNotes(comp.id);
                          setNoteText(comp.notes);
                        }}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: `1px solid ${borderColor}`,
                          backgroundColor: "transparent",
                          color: textSecondary,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Notes
                      </button>
                      <button
                        onClick={() => handleRemove(comp)}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: `1px solid ${borderColor}`,
                          backgroundColor: "transparent",
                          color: theme === "dark" ? "#ef4444" : "#dc2626",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Row 2: details */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 16,
                      fontSize: 13,
                      color: textSecondary,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: textPrimary }}>
                      {fmt(comp.salePrice)}
                    </span>
                    <span>{ppsf(comp.salePrice, comp.sqft)}</span>
                    <span>{comp.sqft.toLocaleString()} sqft</span>
                    <span>
                      {comp.beds}bd / {comp.baths}ba
                    </span>
                    <span>{comp.distance} mi</span>
                    <span>{comp.saleDate}</span>
                  </div>

                  {/* Warning */}
                  {warning && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: theme === "dark" ? "#fbbf24" : "#d97706",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      ⚠ {warning}
                    </div>
                  )}

                  {/* Notes */}
                  {comp.notes && editingNotes !== comp.id && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: textSecondary,
                        fontStyle: "italic",
                      }}
                    >
                      {comp.notes}
                    </div>
                  )}

                  {/* Notes editor */}
                  {editingNotes === comp.id && (
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        gap: 6,
                      }}
                    >
                      <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Adjustment notes (condition, remodel, etc.)"
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1px solid ${borderColor}`,
                          backgroundColor: bg,
                          color: textPrimary,
                          fontSize: 12,
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => handleSaveNotes(comp)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "none",
                          backgroundColor: strengthColor("strong", theme),
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNotes(null)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: `1px solid ${borderColor}`,
                          backgroundColor: "transparent",
                          color: textSecondary,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {sorted.length > VISIBLE_COUNT && (
              <button
                onClick={() => setShowAll(!showAll)}
                style={{
                  padding: "10px 0",
                  border: "none",
                  backgroundColor: "transparent",
                  color: theme === "dark" ? "#3b82f6" : "#2563eb",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {showAll
                  ? "Show less"
                  : `Show ${sorted.length - VISIBLE_COUNT} more comps`}
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {included.length > 0 && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() =>
                sendFollowUpMessage(
                  "Generate a value argument based on the currently selected comparable sales. Use a neutral tone."
                )
              }
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                backgroundColor: theme === "dark" ? "#2563eb" : "#3b82f6",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Draft Argument
            </button>
            <button
              onClick={() =>
                sendFollowUpMessage(
                  "Strengthen my value argument. Focus on the strongest comps and make the case more compelling."
                )
              }
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
                backgroundColor: "transparent",
                color: textPrimary,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Strengthen Argument
            </button>
            <button
              onClick={() =>
                sendFollowUpMessage(
                  "Generate the complete filing packet for my Prop 8 informal review."
                )
              }
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
                backgroundColor: "transparent",
                color: textPrimary,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Generate Packet
            </button>
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
