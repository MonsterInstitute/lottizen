import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Lottizen Plus refund policy — full refund within 7 days of any charge.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">Legal</div>
          <h1 className="section-headline">
            Refund <em>policy.</em>
          </h1>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            <h2>7-day full refund</h2>
            <p>
              If you&rsquo;re not happy with Lottizen Plus, contact us within <strong>7 days</strong>{" "}
              of any charge (the initial trial-conversion charge or a renewal) and we&rsquo;ll
              issue a full refund for that charge, no questions asked.
            </p>

            <h2>How to request one</h2>
            <p>
              Reach us through the contact links on lottizen.com with the email address on your
              account. We process refunds through Stripe, typically within a few business days;
              it may take longer to appear on your statement depending on your bank.
            </p>

            <h2>Cancelling vs. refunding</h2>
            <p>
              Cancelling your subscription (from the billing portal on your account page) stops
              future renewals but does not itself refund a past charge — for that, request a
              refund as above within the 7-day window. Cancelling at any time still lets you keep
              Plus access through the end of the period you&rsquo;ve already paid for.
            </p>

            <h2>The 7-day free trial</h2>
            <p>
              New subscriptions include a {PLANS.plus.trialDays}-day free trial with no charge.
              Cancel any time during the trial and you will never be charged at all — the refund
              policy above only applies once a real charge has occurred.
            </p>

            <p className="field-hint" style={{ marginTop: 24 }}>
              See also our <Link href="/terms">terms of service</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
