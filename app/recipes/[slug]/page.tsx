import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "@/components/site-shell";
import { site } from "@/content/site";

export function generateStaticParams() {
  return site.recipes.map((recipe) => ({ slug: recipe.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const recipe = site.recipes.find((item) => item.slug === slug);
  return { title: recipe?.title ?? "Recipe", description: recipe?.teaser };
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = site.recipes.find((item) => item.slug === slug);
  if (!recipe) notFound();

  return (
    <div className="subpage">
      <div className="page-head">
        <div className="container">
          <Link className="back-link" href="/recipes">All recipes</Link>
          <p className="eyebrow">{recipe.eyebrow}</p>
          <h1>{recipe.headline}</h1>
          <p>{recipe.fit}</p>
          <p>{recipe.intro}</p>
          {recipe.slug === "agentic-payment" ? (
            <div className="page-status">End-to-end Portal verification pending</div>
          ) : (
            <div className="page-status">Not a verified live run. Access or your own code is required.</div>
          )}
        </div>
      </div>
      <div className="page-content">
        <div className="container">
          <div className="recipe-requirements">
            <div><p className="eyebrow">Before you build</p><h2>What you need</h2></div>
            <ul>{recipe.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="content-grid recipe-detail">
            <div>
              <p className="eyebrow">Sequence</p>
              <h2>Do it in this order</h2>
              <div className="step-list">
                {recipe.steps.map((step, index) => (
                  <section className="step-row" key={step.title}>
                    <span className="number">0{index + 1}</span>
                    <div><h3>{step.title}</h3><p>{step.body}</p></div>
                  </section>
                ))}
              </div>
              <div className="note-panel"><h3>What to show a reviewer</h3><p>{recipe.verification}</p></div>
              <div className="note-panel"><h3>Keep this boundary clear</h3><p>{recipe.boundary}</p></div>
            </div>
            <aside className="reading-rail">
              <p className="eyebrow">Related RFBs</p>
              <p>{recipe.rfbs}</p>
              {recipe.slug === "stablefx" ? (
                <>
                  <p className="eyebrow">Integration references</p>
                  <p><ExternalLink href={site.links.stablefxSource}>Aomi StableFX App source</ExternalLink></p>
                  <p><ExternalLink href={site.links.stablefxAccess}>Circle access requirements</ExternalLink></p>
                </>
              ) : recipe.slug === "agentic-payment" ? (
                <>
                  <p className="eyebrow">Start here</p>
                  <p><Link href="/quickstart">Arc Testnet quickstart</Link></p>
                  <p><ExternalLink href={site.links.circleX402}>Circle’s separate x402 example</ExternalLink></p>
                </>
              ) : (
                <>
                  <p className="eyebrow">Read first</p>
                  <p><ExternalLink href={site.links.permissionModel}>Permission model</ExternalLink></p>
                  <p><ExternalLink href={site.links.transactionSafety}>Transaction safety</ExternalLink></p>
                </>
              )}
            </aside>
          </div>
          <div className="resource-panel">
            <h3>Where to go next</h3>
            <p>Keep the first action small. If you need custom tools, start from the Aomi App guide rather than inventing an API call.</p>
            <div className="resource-links">
              <ExternalLink href={site.links.appQuickstart}>Build an Aomi App</ExternalLink>
              <ExternalLink href={site.links.discord}>Ask Aomi builders</ExternalLink>
              <ExternalLink href={site.links.tameionSubmit}>Tameion submission</ExternalLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
