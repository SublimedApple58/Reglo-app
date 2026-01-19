import type { ComponentType, SVGProps } from "react";

export type DocItem = {
  id: string;
  title: string;
  updatedAt: string;
  owner: string;
  previewUrl?: string;
};

export type ToolId = "input" | "sign" | "textarea" | "text";

export type ToolItem = {
  id: ToolId;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
};

export type PlacedField = {
  id: string;
  type: ToolId;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  bindingKey?: string;
  meta?: {
    unit?: "ratio";
    html?: string;
  } | null;
};

export type FillField = {
  id: string;
  type: ToolId;
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  bindingKey?: string | null;
  meta?: {
    unit?: "ratio";
    html?: string;
  } | null;
};
