export function PortalEmbed({ src }: { src: string }) {
  return (
    <section className="portal-desk" id="portal" aria-label="Aomi Portal">
      <iframe
        src={src}
        title="Aomi Portal"
        allow="clipboard-read; clipboard-write"
      />
    </section>
  );
}
