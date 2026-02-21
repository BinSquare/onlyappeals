import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
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

const propertySchema = z.object({
  address: z.string(),
  apn: z.string(),
  type: z.string(),
  assessedValue: z.number(),
  estimatedMarketValue: z.number(),
  sqft: z.number().optional(),
  beds: z.number().optional(),
  baths: z.number().optional(),
});

const argumentSchema = z.object({
  narrative: z.string(),
  declaredMarketValue: z.number(),
  tone: z.enum(["formal", "neutral", "concise"]),
});

const propsSchema = z.object({
  property: propertySchema,
  comps: z.array(compSchema),
  argument: argumentSchema,
  caseStrength: z.enum(["weak", "medium", "strong"]),
  avgCompPrice: z.number(),
  filingWindowOpen: z.boolean(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Filing-ready Prop 8 informal review packet preview",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

export default function PacketPreview() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const [activeTab, setActiveTab] = useState<
    "summary" | "comps" | "argument" | "submit"
  >("summary");

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 24 }}>
          <div
            style={{
              height: 20,
              width: 240,
              borderRadius: 4,
              background: theme === "dark" ? "#333" : "#e5e5e5",
              animation: "pulse 1.5s infinite",
            }}
          />
          <div
            style={{
              marginTop: 16,
              height: 200,
              borderRadius: 8,
              background: theme === "dark" ? "#262626" : "#f5f5f5",
              animation: "pulse 1.5s infinite",
            }}
          />
        </div>
      </McpUseProvider>
    );
  }

  const { property, comps, argument, caseStrength, avgCompPrice, filingWindowOpen } = props;

  const bg = theme === "dark" ? "#1a1a1a" : "#ffffff";
  const cardBg = theme === "dark" ? "#262626" : "#f9fafb";
  const borderColor = theme === "dark" ? "#404040" : "#e5e7eb";
  const textPrimary = theme === "dark" ? "#f3f4f6" : "#111827";
  const textSecondary = theme === "dark" ? "#9ca3af" : "#6b7280";
  const accentBlue = theme === "dark" ? "#3b82f6" : "#2563eb";
  const successGreen = theme === "dark" ? "#22c55e" : "#16a34a";

  const tabs = [
    { key: "summary" as const, label: "Summary" },
    { key: "comps" as const, label: `Comps (${comps.length})` },
    { key: "argument" as const, label: "Argument" },
    { key: "submit" as const, label: "Submit" },
  ];

  const gap = property.assessedValue - argument.declaredMarketValue;
  const gapPct = ((gap / property.assessedValue) * 100).toFixed(1);

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
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              Filing Packet
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: textSecondary }}>
              Prop 8 Informal Review — {property.address}
            </p>
          </div>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: filingWindowOpen
                ? theme === "dark"
                  ? "#1e3a2f"
                  : "#f0fdf4"
                : theme === "dark"
                  ? "#3a2020"
                  : "#fef2f2",
              color: filingWindowOpen ? successGreen : "#dc2626",
              border: `1px solid ${filingWindowOpen ? successGreen : "#dc2626"}40`,
            }}
          >
            Window {filingWindowOpen ? "OPEN" : "CLOSED"}
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: `1px solid ${borderColor}`,
            marginBottom: 20,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "10px 20px",
                border: "none",
                borderBottom:
                  activeTab === tab.key
                    ? `2px solid ${accentBlue}`
                    : "2px solid transparent",
                backgroundColor: "transparent",
                color: activeTab === tab.key ? textPrimary : textSecondary,
                fontWeight: activeTab === tab.key ? 600 : 400,
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div>
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: `1px solid ${borderColor}`,
                backgroundColor: cardBg,
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
                Property Details
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 16,
                }}
              >
                {[
                  { label: "Address", value: property.address },
                  { label: "APN", value: property.apn },
                  { label: "Property Type", value: property.type },
                  {
                    label: "Current Assessed Value",
                    value: fmt(property.assessedValue),
                  },
                  {
                    label: "Declared Market Value",
                    value: fmt(argument.declaredMarketValue),
                  },
                  { label: "Reduction Requested", value: `${fmt(gap)} (${gapPct}%)` },
                ].map((item) => (
                  <div key={item.label}>
                    <div
                      style={{
                        fontSize: 11,
                        color: textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 2,
                      }}
                    >
                      {item.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              {[
                {
                  label: "Case Strength",
                  value: caseStrength.toUpperCase(),
                  color:
                    caseStrength === "strong"
                      ? successGreen
                      : caseStrength === "medium"
                        ? "#ca8a04"
                        : "#dc2626",
                },
                {
                  label: "Comps Used",
                  value: `${comps.length}`,
                  color: accentBlue,
                },
                {
                  label: "Avg Comp Price",
                  value: fmt(avgCompPrice),
                  color: textPrimary,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: cardBg,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: textSecondary,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: stat.color,
                    }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comps Tab */}
        {activeTab === "comps" && (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Address",
                    "Sale Date",
                    "Sale Price",
                    "Sqft",
                    "Bed/Bath",
                    "Distance",
                    "Notes",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: `2px solid ${borderColor}`,
                        color: textSecondary,
                        fontWeight: 600,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comps.map((comp) => (
                  <tr key={comp.id}>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${borderColor}`,
                        fontWeight: 500,
                      }}
                    >
                      {comp.address}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${borderColor}`,
                      }}
                    >
                      {comp.saleDate}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${borderColor}`,
                        fontWeight: 600,
                      }}
                    >
                      {fmt(comp.salePrice)}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${borderColor}`,
                      }}
                    >
                      {comp.sqft.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${borderColor}`,
                      }}
                    >
                      {comp.beds}/{comp.baths}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${borderColor}`,
                      }}
                    >
                      {comp.distance} mi
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${borderColor}`,
                        color: textSecondary,
                        fontStyle: comp.notes ? "italic" : "normal",
                      }}
                    >
                      {comp.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Argument Tab */}
        {activeTab === "argument" && (
          <div>
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: `1px solid ${borderColor}`,
                backgroundColor: cardBg,
                whiteSpace: "pre-wrap",
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {argument.narrative}
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 8,
              }}
            >
              <button
                onClick={() =>
                  sendFollowUpMessage(
                    "Rewrite my value argument in a more formal tone."
                  )
                }
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${borderColor}`,
                  backgroundColor: "transparent",
                  color: textPrimary,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                More Formal
              </button>
              <button
                onClick={() =>
                  sendFollowUpMessage(
                    "Make my value argument shorter and more concise."
                  )
                }
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${borderColor}`,
                  backgroundColor: "transparent",
                  color: textPrimary,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Shorter
              </button>
              <button
                onClick={() =>
                  sendFollowUpMessage(
                    "Strengthen my value argument. Emphasize the strongest comparable sales evidence."
                  )
                }
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: accentBlue,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Strengthen
              </button>
            </div>
          </div>
        )}

        {/* Submit Tab */}
        {activeTab === "submit" && (
          <div>
            {/* Checklist */}
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: `1px solid ${borderColor}`,
                backgroundColor: cardBg,
                marginBottom: 16,
              }}
            >
              <h3
                style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}
              >
                Submission Checklist
              </h3>
              {[
                {
                  label: "Property details entered",
                  done: true,
                },
                {
                  label: `Comparable sales gathered (${comps.length})`,
                  done: comps.length >= 2,
                },
                {
                  label: "Value argument drafted",
                  done: true,
                },
                {
                  label: "Review all materials before submitting",
                  done: false,
                },
                {
                  label: "Keep a copy of everything you submit",
                  done: false,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: `1px solid ${borderColor}20`,
                    fontSize: 14,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: `2px solid ${item.done ? successGreen : borderColor}`,
                      backgroundColor: item.done ? successGreen : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {item.done ? "✓" : ""}
                  </span>
                  <span
                    style={{
                      color: item.done ? textSecondary : textPrimary,
                      textDecoration: item.done ? "line-through" : "none",
                    }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Submission Routes */}
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: `1px solid ${borderColor}`,
                backgroundColor: cardBg,
                marginBottom: 16,
              }}
            >
              <h3
                style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}
              >
                Submission Options
              </h3>

              {/* Online */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  border: `1px solid ${accentBlue}40`,
                  backgroundColor:
                    theme === "dark" ? "#1e2a3f" : "#eff6ff",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      Online Portal (Preferred)
                    </div>
                    <div style={{ fontSize: 12, color: textSecondary }}>
                      sfassessor.org/community-portal
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      backgroundColor: accentBlue,
                      color: "#fff",
                    }}
                  >
                    RECOMMENDED
                  </span>
                </div>
              </div>

              {/* Other options */}
              {[
                {
                  method: "Mail",
                  detail:
                    "City Hall, Room 190, 1 Dr. Carlton B. Goodlett Place, SF CA 94102",
                },
                { method: "Fax", detail: "(415) 554-7151" },
                { method: "Email", detail: "assessor@sfgov.org" },
              ].map((opt) => (
                <div
                  key={opt.method}
                  style={{
                    padding: 12,
                    borderBottom: `1px solid ${borderColor}20`,
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{opt.method}</span>
                  <span style={{ color: textSecondary }}>{opt.detail}</span>
                </div>
              ))}
            </div>

            {/* Disclaimer */}
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                backgroundColor:
                  theme === "dark" ? "#2a2520" : "#fffbeb",
                border: `1px solid ${theme === "dark" ? "#5a4a30" : "#fde68a"}`,
                fontSize: 12,
                color: textSecondary,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: textPrimary }}>Disclaimer:</strong> This
              tool provides informational and document-preparation support only.
              It does not constitute legal or tax advice. No guarantee of
              assessment reduction is made or implied. Only the property owner
              may file. Review all materials before submitting.
            </div>
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
