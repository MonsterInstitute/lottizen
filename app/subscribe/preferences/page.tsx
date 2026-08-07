import type { Metadata } from "next";
import { PreferencesClient } from "./PreferencesClient";

// Token-bearing URL — never index or cache this page.
export const metadata: Metadata = {
  title: "Manage your subscription",
  robots: { index: false, follow: false },
};

export default function PreferencesPage() {
  return (
    <div className="page-head" style={{ paddingBottom: 0 }}>
      <div className="container">
        <div className="section-eyebrow">Your subscription</div>
        <h1 className="section-headline" style={{ fontSize: "clamp(28px,3.4vw,40px)" }}>
          Manage your <em>preferences.</em>
        </h1>
      </div>
      <PreferencesClient />
    </div>
  );
}
