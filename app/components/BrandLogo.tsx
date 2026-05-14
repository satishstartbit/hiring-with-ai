import Image from "next/image";
import Link from "next/link";

const SIZES = {
  sm: { width: 128, height: 63 },
  md: { width: 156, height: 77 },
  lg: { width: 188, height: 92 },
} as const;

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function BrandLogo({
  href,
  size = "md",
  priority = false,
  className,
  imageClassName,
  alt = "HireAI",
}: {
  href?: string | null;
  size?: keyof typeof SIZES;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  alt?: string;
}) {
  const { width, height } = SIZES[size];

  const image = (
    <Image
      src="/logo.png"
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={joinClasses("h-auto w-auto max-w-none object-contain", imageClassName)}
    />
  );

  if (!href) {
    return <span className={joinClasses("inline-flex items-center", className)}>{image}</span>;
  }

  return (
    <Link href={href} className={joinClasses("inline-flex items-center", className)}>
      {image}
    </Link>
  );
}
