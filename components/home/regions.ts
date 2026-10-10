/** Homepage regions: the five Canadian lottery agencies' provinces, the US
 *  and Europe. Every region's block is in the HTML; the browser shows the
 *  visitor's (see RegionScript). */
export const HOME_REGIONS = [
  { key: "ontario", label: "Ontario", short: "ON" },
  { key: "quebec", label: "Quebec", short: "QC" },
  { key: "british-columbia", label: "British Columbia", short: "BC" },
  { key: "alberta", label: "Alberta", short: "AB" },
  { key: "saskatchewan", label: "Saskatchewan", short: "SK" },
  { key: "manitoba", label: "Manitoba", short: "MB" },
  { key: "territories", label: "Yukon, Northwest Territories & Nunavut", short: "YT · NT · NU" },
  { key: "atlantic", label: "Atlantic Canada", short: "NB · NS · PE · NL" },
  { key: "usa", label: "United States", short: "USA" },
  { key: "europe", label: "Europe", short: "Europe" },
] as const;

export type HomeRegion = (typeof HOME_REGIONS)[number]["key"];
