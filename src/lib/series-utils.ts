export const SERIES_LIST = [
  "Active Wear",
  "Lounge Wear",
  "Sleep Wear",
  "CB-101 Series",
  "CB-201 Series",
  "CB-301 Series",
  "CB-401 Series",
  "FB-501 Series",
  "FB-601 Series",
  "FB-701 Series",
  "FB-801 Series",
  "CB-901 Series",
  "CP-1101 Series",
  "CP-1201 Series",
  "CP-1301 Series",
  "CP-1401 Series",
  "CP-1501 Series",
  "FP-1601 Series",
  "FP-1701 Series",
  "FP-1801 Series",
  "CP-1901 Series",
  "Panty Packs",
  "SC Series",
  "CS Series",
  "SHW Series"
];

export function getSeriesFromStyleNumber(styleNo: string): string {
  if (!styleNo) return "General";
  
  const upper = styleNo.toUpperCase().trim();
  
  // AT Series -> Active Wear
  if (
    /^AT([-\s_.:]|\d|$)/.test(upper) ||
    /\bAT[-\s_.:]?\d+/i.test(upper) ||
    upper.includes("ACTIVE")
  ) {
    return "Active Wear";
  }

  // LW Series -> Lounge Wear
  if (
    /^LW([-\s_.:]|\d|$)/.test(upper) ||
    /\bLW[-\s_.:]?\d+/i.test(upper) ||
    upper.includes("LOUNGE")
  ) {
    return "Lounge Wear";
  }

  // NT Series -> Sleep Wear
  if (
    /^NT([-\s_.:]|\d|$)/.test(upper) ||
    /\bNT[-\s_.:]?\d+/i.test(upper) ||
    upper.includes("SLEEP") ||
    upper.includes("NIGHT")
  ) {
    return "Sleep Wear";
  }

  // Specific literal matches
  if (upper.includes("PANTY")) return "Panty Packs";
  if (upper.startsWith("SC")) return "SC Series";
  if (upper.startsWith("CS")) return "CS Series";
  if (upper.startsWith("SHW")) return "SHW Series";

  // Check for CB, CP, FB, or FP numeric ranges
  const match = upper.match(/(CB|CP|FB|FP)[\s_.:-]?(\d+)/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    if (!isNaN(num)) {
      if (prefix === "CB") {
        if (num >= 101 && num <= 200) return "CB-101 Series";
        if (num >= 201 && num <= 300) return "CB-201 Series";
        if (num >= 301 && num <= 400) return "CB-301 Series";
        if (num >= 401 && num <= 500) return "CB-401 Series";
        if (num >= 901) return "CB-901 Series";
      } else if (prefix === "CP") {
        if (num >= 1101 && num <= 1200) return "CP-1101 Series";
        if (num >= 1201 && num <= 1300) return "CP-1201 Series";
        if (num >= 1301 && num <= 1400) return "CP-1301 Series";
        if (num >= 1401 && num <= 1500) return "CP-1401 Series";
        if (num >= 1501 && num <= 1600) return "CP-1501 Series";
        if (num >= 1900) return "CP-1901 Series"; // Handles 1901-2000, including CP-1905
      } else if (prefix === "FB") {
        if (num >= 501 && num <= 600) return "FB-501 Series";
        if (num >= 601 && num <= 700) return "FB-601 Series";
        if (num >= 701 && num <= 800) return "FB-701 Series";
        if (num >= 801 && num <= 900) return "FB-801 Series";
      } else if (prefix === "FP") {
        if (num >= 1601 && num <= 1700) return "FP-1601 Series";
        if (num >= 1701 && num <= 1800) return "FP-1701 Series";
        if (num >= 1801 && num <= 1900) return "FP-1801 Series";
      }
    }
  }

  return "General";
}
