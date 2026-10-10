import type { Metadata } from "next";
import Link from "next/link";

// Lottizen Plus was retired on 2026-10-09 and everything it included became
// free. This URL stays live (old links, bookmarks, past emails) but only to
// explain that and point to where each feature lives now. Not indexed, no
// Product/Offer structured data, no prices.
export const metadata: Metadata = {
  title: "Lottizen Plus has been retired",
  description: "Lottizen Plus has been retired. Everything it included is now free for everyone.",
  robots: { index: false, follow: true },
};

const FEATURES: { text: string; href: string; where: string }[] = [
  {
    text: "The full scratch-ticket board for all 5 provinces, with price filters and ranking modes",
    href: "/scratch",
    where: "Scratch value tracker",
  },
  {
    text: "The budget planner and each ticket's share of prize money still unclaimed",
    href: "/scratch",
    where: "On every province board",
  },
  {
    text: "Follow scratch tickets in any province, with an email when a followed ticket's top prize is claimed or it drops in the rankings",
    href: "/scratch",
    where: "Follow button on any ticket page",
  },
  {
    text: "Follow any number of draw games and save any number of number combinations, checked after every draw",
    href: "/dashboard",
    where: "My Lottizen",
  },
  {
    text: "A ticket wallet with no limit on tickets, claim-deadline countdowns and reminders, and a ledger of what you've spent and won",
    href: "/dashboard",
    where: "My Lottizen",
  },
  {
    text: "Draw-result emails for the games you follow",
    href: "/subscribe",
    where: "Email sign-up",
  },
];

export default function PlusRetiredPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="section-eyebrow">Lottizen Plus</div>
          <h1 className="section-headline">
            Lottizen Plus has been <em>retired.</em>
          </h1>
          <p className="section-lede">
            Everything it included is now free for everyone. There&rsquo;s no paid plan, nothing to
            unlock and no limits — sign in with your email to save your games, numbers and tickets.
          </p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="prose">
            <h2>Where everything lives now</h2>
            <ul>
              {FEATURES.map((f) => (
                <li key={f.text}>
                  {f.text} — <Link href={f.href}>{f.where}</Link>
                </li>
              ))}
            </ul>
            <p>
              The scratch-ticket figures describe how much prize money is still unclaimed, from each
              lottery agency&rsquo;s published data. They don&rsquo;t change the odds of any ticket
              winning — see <Link href="/methodology">how the scores work</Link>.
            </p>
            <div className="hero-cta-row" style={{ marginTop: 24 }}>
              <Link href="/subscribe" className="btn btn-primary">
                Get free email alerts
              </Link>
              <Link href="/dashboard" className="btn btn-secondary">
                Open My Lottizen
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
