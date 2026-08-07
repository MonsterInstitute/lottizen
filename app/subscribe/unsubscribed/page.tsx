import type { Metadata } from "next";
import { SubscribeForm } from "@/components/site/SubscribeForm";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default function UnsubscribedPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="breadcrumb">
            <span>Unsubscribed</span>
          </div>
          <div className="section-eyebrow">Subscription</div>
          <h1 className="section-headline">
            You&rsquo;re <em>unsubscribed.</em>
          </h1>
          <p className="section-lede">
            You won&rsquo;t get any more emails from Lottizen. Changed your mind? Subscribe again
            below.
          </p>
        </div>
      </div>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="card" style={{ padding: 32 }}>
            <SubscribeForm title="Email address" />
          </div>
        </div>
      </section>
    </>
  );
}
