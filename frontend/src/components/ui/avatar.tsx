import Image from "next/image";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={36}
        height={36}
        referrerPolicy="no-referrer"
        className="size-9 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
    >
      {initials(name)}
    </span>
  );
}
