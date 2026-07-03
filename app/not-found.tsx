import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section" style={{ textAlign: "center" }}>
      <div className="container">
        <div className="section-eyebrow">404</div>
        <h1 className="section-headline" style={{ margin: "0 auto 20px" }}>
          Not a <em>winner.</em>
        </h1>
        <p className="section-lede" style={{ margin: "0 auto 32px" }}>
          That page isn&rsquo;t on the board. Let&rsquo;s get you back to
          today&rsquo;s rankings.
        </p>
        <Link href="/" className="btn btn-primary" style={{ display: "inline-flex" }}>
          Back to rankings
        </Link>
      </div>
    </section>
  );
}
