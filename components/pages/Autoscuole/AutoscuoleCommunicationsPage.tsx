"use client";

import React from "react";
import { PencilLine, Plus, Save, Trash2 } from "lucide-react";

import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { AutoscuoleNav } from "./AutoscuoleNav";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TokenInput } from "@/components/pages/Workflows/Editor/shared/token-input";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  createAutoscuolaRule,
  deleteAutoscuolaRule,
  getAutoscuolaCommunications,
  updateAutoscuolaRule,
} from "@/lib/actions/autoscuola-communications.actions";
import { autoscuolaTemplateVariables } from "@/lib/autoscuole/variables";

type Rule = {
  id: string;
  type: string;
  appointmentType: string | null;
  deadlineType?: string | null;
  offsetDays: number;
  channel: string;
  target: string;
  active: boolean;
  template: {
    id: string;
    name: string;
    channel: string;
    subject: string | null;
    body: string;
  };
};

const emptyDraft = () => ({
  type: "APPOINTMENT_BEFORE",
  active: true,
  offsetDays: 7,
  channel: "email",
  target: "student",
  appointmentType: "esame",
  deadlineType: "PINK_SHEET_EXPIRES",
  subject: "",
  body: "",
});

export function AutoscuoleCommunicationsPage() {
  const toast = useFeedbackToast();
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [activeRule, setActiveRule] = React.useState<Rule | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState(emptyDraft);

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
                Crea regole personalizzate per esami, guide, scadenze e aggiornamenti pratica.
              </p>
            </div>
            <Button
              className="h-9"
              onClick={() => {
                setIsCreating(true);
                setActiveRule(null);
                setRuleDraft(emptyDraft());
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuova regola
            </Button>
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
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCreating(false);
                      setActiveRule(rule);
                      setRuleDraft({
                        type: rule.type,
                        active: rule.active,
                        offsetDays: rule.offsetDays,
                        channel: rule.channel,
                        target: rule.target,
                        appointmentType: rule.appointmentType ?? "",
                        deadlineType: rule.deadlineType ?? "PINK_SHEET_EXPIRES",
                        subject: rule.template.subject ?? "",
                        body: rule.template.body,
                      });
                    }}
                  >
                    <PencilLine className="mr-2 h-4 w-4" />
                    Modifica regola
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const res = await deleteAutoscuolaRule(rule.id);
                      if (!res.success) {
                        toast.error({
                          description: res.message ?? "Impossibile eliminare la regola.",
                        });
                        return;
                      }
                      await load();
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Elimina
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
      </div>

      <Drawer
        open={isCreating || !!activeRule}
        onOpenChange={() => {
          setActiveRule(null);
          setIsCreating(false);
        }}
      >
        <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>{isCreating ? "Nuova regola" : "Modifica regola"}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 px-4 pb-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Tipo regola
              </p>
              <select
                className="h-10 w-full rounded-md border border-white/60 bg-white/80 px-3 text-sm"
                value={ruleDraft.type}
                onChange={(event) => {
                  const value = event.target.value;
                  setRuleDraft((prev) => ({
                    ...prev,
                    type: value,
                    appointmentType: value === "APPOINTMENT_BEFORE" ? "esame" : "",
                    deadlineType: value === "CASE_DEADLINE_BEFORE" ? "PINK_SHEET_EXPIRES" : prev.deadlineType,
                  }));
                }}
              >
                <option value="APPOINTMENT_BEFORE">Promemoria appuntamento</option>
                <option value="CASE_STATUS_CHANGED">Cambio stato pratica</option>
                <option value="CASE_DEADLINE_BEFORE">Scadenza pratica</option>
              </select>
            </div>

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

            {ruleDraft.type !== "CASE_STATUS_CHANGED" ? (
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

            {ruleDraft.type === "CASE_DEADLINE_BEFORE" ? (
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

            {ruleDraft.type === "APPOINTMENT_BEFORE" ? (
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

            {ruleDraft.channel === "email" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Oggetto
                </p>
                <TokenInput
                  value={ruleDraft.subject}
                  onChange={(value) =>
                    setRuleDraft((prev) => ({ ...prev, subject: value }))
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
                value={ruleDraft.body}
                onChange={(value) =>
                  setRuleDraft((prev) => ({ ...prev, body: value }))
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
                const payload = {
                  active: ruleDraft.active,
                  offsetDays: ruleDraft.offsetDays,
                  channel: ruleDraft.channel as "email" | "whatsapp" | "sms",
                  target: ruleDraft.target as "student" | "staff",
                  appointmentType:
                    ruleDraft.type === "APPOINTMENT_BEFORE" ? ruleDraft.appointmentType || null : null,
                  deadlineType:
                    ruleDraft.type === "CASE_DEADLINE_BEFORE" ? ruleDraft.deadlineType : null,
                  subject: ruleDraft.channel === "email" ? ruleDraft.subject : null,
                  body: ruleDraft.body,
                };

                const res = isCreating
                  ? await createAutoscuolaRule({
                      type: ruleDraft.type as
                        | "APPOINTMENT_BEFORE"
                        | "CASE_STATUS_CHANGED"
                        | "CASE_DEADLINE_BEFORE",
                      ...payload,
                    })
                  : activeRule
                    ? await updateAutoscuolaRule({
                        id: activeRule.id,
                        ...payload,
                      })
                    : null;

                if (!res?.success) {
                  toast.error({
                    description: res?.message ?? "Impossibile salvare la regola.",
                  });
                  return;
                }
                await load();
                setActiveRule(null);
                setIsCreating(false);
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              {isCreating ? "Crea regola" : "Salva regola"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </ClientPageWrapper>
  );
}
