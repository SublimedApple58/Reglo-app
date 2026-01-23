import { useEffect, useState } from "react";

import { listDocumentTemplates } from "@/lib/actions/document.actions";
import type { TemplateOption } from "@/components/pages/Workflows/Editor/types";

export const useDocumentTemplates = () => {
  const [documentTemplateOptions, setDocumentTemplateOptions] = useState<TemplateOption[]>([]);
  const [templateBindingKeys, setTemplateBindingKeys] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let isMounted = true;
    const loadTemplates = async () => {
      const res = await listDocumentTemplates();
      if (!res.success || !res.data || !isMounted) return;
      setDocumentTemplateOptions(
        res.data.documents.map((template) => ({
          label: template.title,
          value: template.id,
        })),
      );
      const bindingsMap: Record<string, string[]> = {};
      res.data.documents.forEach((template) => {
        bindingsMap[template.id] = template.bindingKeys ?? [];
      });
      setTemplateBindingKeys(bindingsMap);
    };
    loadTemplates();
    return () => {
      isMounted = false;
    };
  }, []);

  return { documentTemplateOptions, templateBindingKeys };
};
