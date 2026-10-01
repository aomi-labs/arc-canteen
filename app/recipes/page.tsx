import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Recipes",
  description: "One Arc payment walkthrough and two scoped integration directions for Tameion builders.",
};

export default function RecipesPage() {
  return (
    <div className="subpage">
      <div className="page-head">
        <div className="container">
          <Link className="back-link" href="/">Home</Link>
          <p className="eyebrow">From one action to a project</p>
          <h1>Start with a flow you can check.</h1>
          <p>Circle and Arc hold the wallet and the asset. You hold the business rule. Aomi holds construction, simulation, and the path to a signer. Each recipe names the stack step it attaches to. Start with the payment you can check.</p>
        </div>
      </div>
      <div className="page-content">
        <div className="container">
          <div className="recipe-collection">
            {site.recipes.map((recipe) => (
              <div className="recipe-list-item" key={recipe.slug}>
                <span className="recipe-index">{recipe.number}</span>
                <div>
                  <h2>{recipe.title}</h2>
                  <p>{recipe.teaser}</p>
                  <p>{recipe.fit}</p>
                  <small>{recipe.label} · {recipe.rfbs}</small>
                </div>
                <Link href={`/recipes/${recipe.slug}`}>Open recipe</Link>
              </div>
            ))}
          </div>
          <div className="note-panel">
            <h3>Before you pick a recipe</h3>
            <p>A successful simulation cannot prove the payee is real, a service was delivered or an FX quote is available. Build those checks into your application, then test the execution boundary.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
