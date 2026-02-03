"use client";

import React from "react";
import { PencilLine, Save } from "lucide-react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TokenInput } from "@/components/pages/Workflows/Editor/shared/token-input";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  getAutoscuolaCommunications,
  updateAutoscuolaRule,
  updateAutoscuolaTemplate,
} from "@/lib/actions/autoscuola-communications.actions";
import { autoscuolaTemplateVariables } from "@/lib/autoscuole/variables";

type Template = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
};

type Rule = {
  id: string;
  type: string;
  appointmentType: string | null;
  deadlineType?: string | null;
  offsetDays: number;
  channel: string;
  target: string;
  active: boolean;
  template: Template;
};

export function AutoscuoleCommunicationsPage() {
  const toast = useFeedbackToast();
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [activeTemplate, setActiveTemplate] = React.useState<Template | null>(null);
  const [activeRule, setActiveRule] = React.useState<Rule | null>(null);

  const [templateDraft, setTemplateDraft] = React.useState({ subject: "", body: "" });
  const [ruleDraft, setRuleDraft] = React.useState({
    active: true,
    offsetDays: 0,
    channel: "email",
    target: "student",
    appointmentType: "",
    deadlineType: "PINK_SHEET_EXPIRES",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await getAutoscuolaCommunications();
    if (!res.success || !res.data) {
      toast.error({
        description: res.message ?? "Impossibile caricare le comunicazioni.",
      });
      setLoading(false);
      return;
    }
    setTemplates(res.data.templates);
    setRules(res.data.rules as Rule[]);
    setLoading(false);
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <ClientPageWrapper
      title="Autoscuole"
      subTitle="Comunicazioni automatiche con allievi e staff."
      hideHero
    >
      <div className="space-y-5">
        <AutoscuoleNav />

        <section className="glass-panel glass-strong p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Regole automatiche
              </p>
              <p className="text-sm text-muted-foreground">
                Definisci quando inviare email o WhatsApp per esami, guide, scadenze e aggiornamenti pratica.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {rules.map((rule) => (
              <div key={rule.id} className="glass-card glass-strong flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {rule.type === "CASE_STATUS_CHANGED"
                        ? "Aggiornamento pratica"
                        : rule.type === "CASE_DEADLINE_BEFORE"
                          ? `Scadenza ${
                              rule.deadlineType === "MEDICAL_EXPIRES"
                                ? "visita medica"
                                : "foglio rosa"
                            }`
                          : `Promemoria ${rule.appointmentType ?? "appuntamento"}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rule.type === "CASE_STATUS_CHANGED"
                        ? "Invio immediato quando cambia lo stato pratica."
                        : `${rule.offsetDays} giorni prima`}
                    </p>
                  </div>
                  <Badge variant={rule.active ? "secondary" : "outline"}>
                    {rule.active ? "Attivo" : "Disattivo"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="glass-chip">
                    Canale: {rule.channel === "whatsapp" ? "WHATSAPP" : rule.channel.toUpperCase()}
                  </span>
                  <span className="glass-chip">Target: {rule.target}</span>
                  <span className="glass-chip">Template: {rule.template.name}</span>
                </div>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveRule(rule);
                      setRuleDraft({
                        active: rule.active,
                        offsetDays: rule.offsetDays,
                        channel: rule.channel,
                        target: rule.target,
                        appointmentType: rule.appointmentType ?? "",
                        deadlineType: rule.deadlineType ?? "PINK_SHEET_EXPIRES",
                      });
                    }}
                  >
                    <PencilLine className="mr-2 h-4 w-4" />
                    Modifica regola
                  </Button>
                </div>
              </div>
            ))}
            {!rules.length && !loading ? (
              <div className="text-sm text-muted-foreground">
                Nessuna regola configurata.
              </div>
            ) : null}
          </div>
        </section>

        <section className="glass-panel glass-strong p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Template messaggi
              </p>
              <p className="text-sm text-muted-foreground">
                Personalizza i testi delle comunicazioni con i dati dell&apos;allievo.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {templates.map((template) => (
              <div key={template.id} className="glass-card glass-strong flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Canale: {template.channel === "whatsapp" ? "WHATSAPP" : template.channel.toUpperCase()}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {template.channel === "whatsapp" ? "whatsapp" : template.channel}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {template.body}
                </p>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveTemplate(template);
                      setTemplateDraft({
                        subject: template.subject ?? "",
                        body: template.body,
                      });
                    }}
                  >
                    <PencilLine className="mr-2 h-4 w-4" />
                    Modifica template
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Drawer open={!!activeTemplate} onOpenChange={() => setActiveTemplate(null)}>
        <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>Modifica template</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 px-4 pb-4">
            {activeTemplate?.channel === "email" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Oggetto
                </p>
                <TokenInput
                  value={templateDraft.subject}
                  onChange={(value) =>
                    setTemplateDraft((prev) => ({ ...prev, subject: value }))
                  }
                  variables={autoscuolaTemplateVariables}
                  placeholder="Oggetto email"
                />
              </div>
            ) : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Messaggio
              </p>
              <TokenInput
                value={templateDraft.body}
                onChange={(value) =>
                  setTemplateDraft((prev) => ({ ...prev, body: value }))
                }
                variables={autoscuolaTemplateVariables}
                placeholder="Scrivi il testo del messaggio"
                multiline
              />
            </div>
          </div>
          <DrawerFooter className="border-t border-white/40">
            <Button
              className="w-full"
              onClick={async () => {
                if (!activeTemplate) return;
                const res = await updateAutoscuolaTemplate({
                  id: activeTemplate.id,
                subject: activeTemplate.channel === "email" ? templateDraft.subject : undefined,
                  body: templateDraft.body,
                });
                if (!res.success) {
                  toast.error({
                    description: res.message ?? "Impossibile salvare il template.",
                  });
                  return;
                }
                await load();
                setActiveTemplate(null);
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              Salva template
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={!!activeRule} onOpenChange={() => setActiveRule(null)}>
        <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>Modifica regola</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 px-4 pb-4 text-sm">
            <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
              <span>Attiva regola</span>
              <input
                type="checkbox"
                checked={ruleDraft.active}
                onChange={(event) =>
                  setRuleDraft((prev) => ({ ...prev, active: event.target.checked }))
                }
              />
            </div>
            {activeRule?.type === "APPOINTMENT_BEFORE" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Giorni di anticipo
                </p>
                <Input
                  type="number"
                  value={ruleDraft.offsetDays}
                  onChange={(event) =>
                    setRuleDraft((prev) => ({
                      ...prev,
                      offsetDays: Number(event.target.value),
                    }))
                  }
                />
              </div>
            ) : null}
            {activeRule?.type === "CASE_DEADLINE_BEFORE" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Giorni di anticipo
                </p>
                <Input
                  type="number"
                  value={ruleDraft.offsetDays}
                  onChange={(event) =>
                    setRuleDraft((prev) => ({
                      ...prev,
                      offsetDays: Number(event.target.value),
                    }))
                  }
                />
              </div>
            ) : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Canale
              </p>
              <select
                className="h-10 w-full rounded-md border border-white/60 bg-white/80 px-3 text-sm"
                value={ruleDraft.channel}
                onChange={(event) =>
                  setRuleDraft((prev) => ({ ...prev, channel: event.target.value }))
                }
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Target
              </p>
              <select
                className="h-10 w-full rounded-md border border-white/60 bg-white/80 px-3 text-sm"
                value={ruleDraft.target}
                onChange={(event) =>
                  setRuleDraft((prev) => ({ ...prev, target: event.target.value }))
                }
              >
                <option value="student">Allievo</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            {activeRule?.type === "CASE_DEADLINE_BEFORE" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Tipo scadenza
                </p>
                <select
                  className="h-10 w-full rounded-md border border-white/60 bg-white/80 px-3 text-sm"
                  value={ruleDraft.deadlineType}
                  onChange={(event) =>
                    setRuleDraft((prev) => ({ ...prev, deadlineType: event.target.value }))
                  }
                >
                  <option value="PINK_SHEET_EXPIRES">Foglio rosa</option>
                  <option value="MEDICAL_EXPIRES">Visita medica</option>
                </select>
              </div>
            ) : null}
            {activeRule?.type === "APPOINTMENT_BEFORE" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Tipo appuntamento
                </p>
                <select
                  className="h-10 w-full rounded-md border border-white/60 bg-white/80 px-3 text-sm"
                  value={ruleDraft.appointmentType}
                  onChange={(event) =>
                    setRuleDraft((prev) => ({ ...prev, appointmentType: event.target.value }))
                  }
                >
                  <option value="guida">Guida</option>
                  <option value="esame">Esame</option>
                </select>
              </div>
            ) : null}
          </div>
          <DrawerFooter className="border-t border-white/40">
            <Button
              className="w-full"
              onClick={async () => {
                if (!activeRule) return;
                const res = await updateAutoscuolaRule({
                  id: activeRule.id,
                  active: ruleDraft.active,
                  offsetDays: ruleDraft.offsetDays,
                  channel: ruleDraft.channel as "email" | "whatsapp" | "sms",
                  target: ruleDraft.target as "student" | "staff",
                  appointmentType: ruleDraft.appointmentType || null,
                  deadlineType:
                    activeRule.type === "CASE_DEADLINE_BEFORE"
                      ? ruleDraft.deadlineType
                      : null,
                });
                if (!res.success) {
                  toast.error({
                    description: res.message ?? "Impossibile salvare la regola.",
                  });
                  return;
                }
                await load();
                setActiveRule(null);
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              Salva regola
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </ClientPageWrapper>
  );
}
