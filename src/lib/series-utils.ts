export const SERIES_LIST = [
  "Active Wear",
  "LW",
  "SW",
  "General",
  "Active wear",
  "Lounge Wear",
  "Sleep Wear"
];

export const STANDARD_CATEGORY_TABS = [
  "Active Wear",
  "LW",
  "SW",
  "General"
];

// All possible sheet tab name variations to search when querying Google Sheets
export const ALL_SHEET_TABS = [
  "Active Wear",
  "Active wear",
  "LW",
  "Lounge Wear",
  "SW",
  "Sleep Wear",
  "General"
];

export function getSeriesFromStyleNumber(styleNo: string): string {
  if (!styleNo) return "General";
  
  const upper = styleNo.toUpperCase().trim();
  
  // AT Series: AT-100 to AT-999 -> Active Wear
  if (
    /^AT([-\s_.:]|\d|$)/.test(upper) ||
    /\bAT[-\s_.:]?\d+/i.test(upper) ||
    upper.includes("ACTIVE")
  ) {
    return "Active Wear";
  }

  // LW Series: LW-100 to LW-999 -> LW (Lounge Wear)
  if (
    /^LW([-\s_.:]|\d|$)/.test(upper) ||
    /\bLW[-\s_.:]?\d+/i.test(upper) ||
    upper.includes("LOUNGE")
  ) {
    return "LW";
  }

  // SW Series: SW-100 to SW-999 (also NT / Sleep) -> SW (Sleep Wear)
  if (
    /^SW([-\s_.:]|\d|$)/.test(upper) ||
    /\bSW[-\s_.:]?\d+/i.test(upper) ||
    /^NT([-\s_.:]|\d|$)/.test(upper) ||
    /\bNT[-\s_.:]?\d+/i.test(upper) ||
    upper.includes("SLEEP") ||
    upper.includes("NIGHT")
  ) {
    return "SW";
  }

  return "General";
}
