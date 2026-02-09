"use client";

import * as React from "react";

type TooltipProps = { children: React.ReactNode; delayDuration?: number };
type TooltipTriggerProps = React.HTMLAttributes<HTMLSpanElement> & {
  asChild?: boolean;
};
type TooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  side?: string;
  align?: string;
};

function Tooltip({ children }: TooltipProps) {
  const items = React.Children.toArray(children);
  let contentText = "";
  items.forEach((child) => {
    if (
      React.isValidElement(child) &&
      (child.type as React.ComponentType)?.displayName === "TooltipContent"
    ) {
      contentText =
        typeof child.props.children === "string" ? child.props.children : "";
    }
  });

  return (
    <>
      {items.map((child) => {
        if (
          React.isValidElement(child) &&
          (child.type as React.ComponentType)?.displayName === "TooltipTrigger"
        ) {
          return React.cloneElement(child, {
            title: contentText,
            key: child.key ?? "tooltip-trigger",
          });
        }
        if (
          React.isValidElement(child) &&
          (child.type as React.ComponentType)?.displayName === "TooltipContent"
        ) {
          return null;
        }
        return child;
      })}
    </>
  );
}

function TooltipTrigger({ children, asChild, ...props }: TooltipTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, props);
  }
  return (
    <span data-slot="tooltip-trigger" {...props}>
      {children}
    </span>
  );
}

function TooltipContent({ children, ...props }: TooltipContentProps) {
  return (
    <div data-slot="tooltip-content" {...props}>
      {children}
    </div>
  );
}

function TooltipProvider({ children }: TooltipProps) {
  return <>{children}</>;
}

TooltipTrigger.displayName = "TooltipTrigger";
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
