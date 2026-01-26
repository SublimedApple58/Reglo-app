import type { VariableOption } from "@/components/pages/Workflows/Editor/types";

export const tokenRegex = /{{\s*([^}]+)\s*}}/g;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const tokenLabelFor = (token: string, variables: VariableOption[]) => {
  const match = variables.find((item) => item.token === token);
  if (match) return match.label;
  if (token.startsWith("trigger.payload.")) {
    const key = token.replace("trigger.payload.", "");
    return key ? key : "Dato trigger";
  }
  if (token.startsWith("steps.")) return "Output step";
  return "Dato dinamico";
};

export const toTokenHtml = (value: string, variables: VariableOption[]) => {
  const normalized =
    typeof value === "string" ? value : value == null ? "" : String(value);
  let lastIndex = 0;
  let html = "";
  for (const match of normalized.matchAll(tokenRegex)) {
    const token = match[1]?.trim();
    if (!token) continue;
    const index = match.index ?? 0;
    html += escapeHtml(normalized.slice(lastIndex, index));
    html += `<span data-token="${escapeHtml(
      token,
    )}" contenteditable="false" class="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">${escapeHtml(
      tokenLabelFor(token, variables),
    )}</span>`;
    lastIndex = index + match[0].length;
  }
  html += escapeHtml(normalized.slice(lastIndex));
  return html || "";
};

export const serializeTokenInput = (root: HTMLDivElement | null) => {
  if (!root) return "";
  const parts: string[] = [];
  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.dataset.token) {
      parts.push(`{{${element.dataset.token}}}`);
      return;
    }
    if (element.tagName === "BR") {
      parts.push("\n");
      return;
    }
    element.childNodes.forEach(walk);
    if (element.tagName === "DIV" || element.tagName === "P") {
      parts.push("\n");
    }
  };
  root.childNodes.forEach(walk);
  return parts.join("").replace(/\n+$/g, "");
};

export const insertTokenAtSelection = (
  root: HTMLDivElement | null,
  token: string,
  variables: VariableOption[],
  selectionRange?: Range | null,
) => {
  if (!root) return null;
  const label = tokenLabelFor(token, variables);
  const selection = window.getSelection();
  root.focus();
  const span = document.createElement("span");
  span.dataset.token = token;
  span.contentEditable = "false";
  span.className =
    "inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary";
  span.textContent = label;
  const space = document.createTextNode(" ");

  let range: Range | null = selectionRange ?? null;
  if (range && !root.contains(range.commonAncestorContainer)) {
    range = null;
  }
  if (!range && selection && selection.rangeCount > 0) {
    const candidate = selection.getRangeAt(0);
    if (root.contains(candidate.commonAncestorContainer)) {
      range = candidate;
    }
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
  }

  range.deleteContents();
  range.insertNode(space);
  range.insertNode(span);
  range.setStartAfter(space);
  range.collapse(true);
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return range;
};
