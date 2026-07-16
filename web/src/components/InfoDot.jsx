import { Info } from "lucide-react";
import { C } from "../lib/theme.js";

// Tiny info affordance that shows a plain-English metric definition on hover /
// focus (native title tooltip — keyboard-focusable, no JS state needed). Keeps
// non-technical viewers oriented without cluttering the layout.
export default function InfoDot({ text, label }) {
  return (
    <span tabIndex={0} title={text} aria-label={label ? `${label}: ${text}` : text}
      style={{ display: "inline-flex", alignItems: "center", cursor: "help", color: C.faint, verticalAlign: "middle", marginLeft: 4 }}>
      <Info size={13} strokeWidth={2.2} />
    </span>
  );
}
