const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    // Google avatar URLs are external and already sized; next/image would need remotePatterns.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
      {initials(name)}
    </span>
  );
}
