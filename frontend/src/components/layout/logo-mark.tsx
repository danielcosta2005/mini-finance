type LogoMarkProps = {
  className?: string;
  size?: number;
};

export function LogoMark({ className, size = 20 }: LogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      focusable="false"
    >
      <path
        d="M7 30V10l13 14 13-14v20"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
