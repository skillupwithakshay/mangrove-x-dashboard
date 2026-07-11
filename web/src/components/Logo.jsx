// Official Mangrove horizontal logo (mark + wordmark), served from the site's
// CDN so it's always the real, current asset. `size` sets the logo height.
const LOGO_URL =
  "https://mangrove.ai/wp-content/uploads/2026/02/Mangrove-Horiz-FullColor-1-1024x196.png";

export default function Logo({ size = 34 }) {
  return (
    <img
      src={LOGO_URL}
      alt="Mangrove"
      style={{ height: size, width: "auto", display: "block" }}
    />
  );
}
