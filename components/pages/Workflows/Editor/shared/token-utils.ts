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
  root.childNodes.forEach((node) => {
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
    if (element.tagName === "DIV") {
      parts.push(element.textContent ?? "");
      parts.push("\n");
      return;
    }
    parts.push(element.textContent ?? "");
  });
  return parts.join("").replace(/\n+$/g, "");
};

export const insertTokenAtSelection = (
  root: HTMLDivElement | null,
  token: string,
  variables: VariableOption[],
) => {
  if (!root) return;
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

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(space);
    range.insertNode(span);
    range.setStartAfter(space);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    root.appendChild(span);
    root.appendChild(space);
  }
};
