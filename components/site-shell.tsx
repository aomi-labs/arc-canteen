"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { site } from "@/content/site";

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button className="theme-toggle" type="button" aria-label={label} onClick={toggle}>
      {theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M12.6 3.4l-.85.85M4.25 11.75l-.85.85" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M13.2 9.4A5.4 5.4 0 0 1 6.6 2.8 5.6 5.6 0 1 0 13.2 9.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function isCurrent(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/" aria-label="Aomi, home">
          {/* Existing Aomi Labs vector mark. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-mark" src="/aomi-mark.svg" alt="" width="28" height="28" />
          <span className="brand-name">aomi</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {site.nav.map((item) => (
            <Link
              href={item.href}
              key={item.label}
              className={isCurrent(pathname, item.href) ? "nav-active" : undefined}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-tools">
          <ThemeToggle />
          <ExternalLink href={site.links.docs} className="header-ghost">
            Docs
          </ExternalLink>
          <ExternalLink href={site.links.portal} className="header-action">
            Open Aomi
          </ExternalLink>
        </div>
      </div>
      <nav className="mobile-nav container" aria-label="Mobile navigation">
        {site.nav.map((item) => (
          <Link
            href={item.href}
            key={item.label}
            className={isCurrent(pathname, item.href) ? "nav-active" : undefined}
            aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-cta">
        <div>
          <p className="eyebrow">Show a judge a receipt</p>
          <h2>{site.footer.title}</h2>
          <p>{site.footer.body}</p>
        </div>
        <ExternalLink href={site.links.discord} className="button button-light">
          Ask in Discord
        </ExternalLink>
      </div>
      <div className="container footer-columns">
        {site.footer.columns.map((column) => (
          <div key={column.title}>
            <h3>{column.title}</h3>
            {column.links.map((item) =>
              item.href.startsWith("/") ? (
                <Link href={item.href} key={item.label}>{item.label}</Link>
              ) : (
                <ExternalLink href={item.href} key={item.label}>{item.label}</ExternalLink>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="container footer-bottom">
        <span>{site.footer.attribution}</span>
      </div>
    </footer>
  );
}
