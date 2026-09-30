import Link from "next/link";
import type { Recipe } from "@/content/site";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={`/recipes/${recipe.slug}`} className="recipe-card">
      <span className="recipe-card-top">
        <span>{recipe.number} / {recipe.label}</span>
      </span>
      <span className="recipe-card-bottom">
        <strong>{recipe.title}</strong>
        <span>{recipe.teaser}</span>
        <small>{recipe.rfbs}</small>
        <span className="recipe-open">Open the recipe</span>
      </span>
    </Link>
  );
}
