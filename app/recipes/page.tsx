import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Recipes",
  description: "Queue one small test payment. Simulate it. Sign once. Open the receipt on ArcScan.",
};

export default function RecipesPage() {
  return (
    <div className="subpage">
      <div className="page-head">
        <div className="container">
          <Link className="back-link" href="/">Home</Link>
          <p className="eyebrow">From one action to a project</p>
          <h1>Start with a flow you can check.</h1>
          <p>One walkthrough signs with the Canteen key. StableFX needs a Circle credential. Skip it unless you have one.</p>
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
            <h3>A passing simulation is not a real invoice</h3>
            <p>A passing simulation means the transaction would run. It does not mean the invoice is real. Check the payee and the invoice in your code.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
