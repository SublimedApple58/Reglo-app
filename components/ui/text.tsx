export default function Text({
  children,
  type = "p",
}: {
  children?: React.ReactNode;
  type?: "h1" | "h2" | "h3" | "h4" | "p";
}): React.ReactElement {
  switch (type) {
    case "h1":
      return (
        <h1 className="ds-title scroll-m-20 text-center text-balance">
          {children}
        </h1>
      );
    case "h2":
      return (
        <h2 className="ds-section-primary scroll-m-20 pb-2 first:mt-0">
          {children}
        </h2>
      );
    case "h3":
      return (
        <h3 className="ds-section-secondary scroll-m-20">
          {children}
        </h3>
      );
    case "h4":
      return (
        <h4 className="ds-section-tertiary scroll-m-20">
          {children}
        </h4>
      );
    case "p":
      return <p className="ds-body [&:not(:first-child)]:mt-6">{children}</p>;

    default:
      return <></>;
  }
}
