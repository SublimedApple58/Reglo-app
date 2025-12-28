"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { cn } from "@/lib/utils";

type TabKey = "app" | "account";
type TabItem = { label: string; value: TabKey };

const appPresets = ["Default", "Minimal", "Data-heavy", "Live collaboration"];

export function SettingsPage(): React.ReactElement {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [toggles, setToggles] = useState({
    smartHints: true,
    compactMode: false,
    notifications: true,
    aiAutoLabels: true,
    betaFeatures: false,
    twoFactor: true,
  });
  const [refreshRate, setRefreshRate] = useState(65);

  const tabItems = useMemo<TabItem[]>(
    () => [
      { label: "App", value: "app" },
      { label: "Account", value: "account" },
    ],
    [],
  );
  const activeTab = tabItems[activeTabIndex]?.value ?? "app";

  return (
    <ClientPageWrapper title="Settings">
      <div className="space-y-6">
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Area impostazioni</CardTitle>
              <CardDescription>
                Scegli layout, interazioni e sicurezza. Ogni modifica è salvata
                localmente per ora.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary">Autosave mock</Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600">
                Live preview
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <TabsSwitcher
              items={tabItems}
              activeIndex={activeTabIndex}
              onChange={(index) => setActiveTabIndex(index)}
            />
            <p className="text-sm text-muted-foreground">
              Applica a colpo d&apos;occhio più combinazioni di input: toggle,
              select, text e layout misti.
            </p>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {activeTab === "app" ? (
            <motion.div
              key="app"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="grid gap-4 xl:grid-cols-[2fr_1fr]"
            >
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>App experience</CardTitle>
                    <CardDescription>
                      Personalizza come l&apos;app appare e reagisce ai tuoi
                      input.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <LabeledInput
                        label="Workspace name"
                        placeholder="Acme internal ops"
                        defaultValue="Reglo - Pilot"
                      />
                      <LabeledInput
                        label="Tagline"
                        placeholder="Una frase che descrive il workspace"
                        defaultValue="Automazione leggera, zero attrito."
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <LabelMini>Preset</LabelMini>
                        <Select defaultValue="Default">
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a preset" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Layout</SelectLabel>
                              {appPresets.map((preset) => (
                                <SelectItem key={preset} value={preset}>
                                  {preset}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Cambia micro-animazioni e densità.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <LabelMini>Primary color</LabelMini>
                        <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
                          <div className="grid w-full gap-2">
                            <Input
                              type="text"
                              defaultValue="#1D7CF2"
                              className="font-mono"
                            />
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">Brand</Badge>
                              <Badge variant="outline">Accessible</Badge>
                            </div>
                          </div>
                          <div className="h-10 w-10 rounded-lg border bg-gradient-to-br from-primary to-primary/50" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <LabelMini>Page density</LabelMini>
                        <RangeRow
                          value={refreshRate}
                          onChange={setRefreshRate}
                          min={20}
                          max={100}
                          suffix="%"
                        />
                        <p className="text-xs text-muted-foreground">
                          Controlla la densità degli elementi in tabella.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ToggleRow
                        title="Suggerimenti smart"
                        description="Mostra tooltip animati basati sul contesto."
                        checked={toggles.smartHints}
                        onChange={(val) =>
                          setToggles((prev) => ({ ...prev, smartHints: val }))
                        }
                      />
                      <ToggleRow
                        title="Modalità compatta"
                        description="Riduci padding e margini per schermi piccoli."
                        checked={toggles.compactMode}
                        onChange={(val) =>
                          setToggles((prev) => ({ ...prev, compactMode: val }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ToggleRow
                        title="Notifiche push"
                        description="Alert in-app e badge dinamici."
                        checked={toggles.notifications}
                        onChange={(val) =>
                          setToggles((prev) => ({ ...prev, notifications: val }))
                        }
                      />
                      <ToggleRow
                        title="Etichette AI"
                        description="Classificazione automatica dei documenti."
                        checked={toggles.aiAutoLabels}
                        onChange={(val) =>
                          setToggles((prev) => ({ ...prev, aiAutoLabels: val }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Data &amp; privacy</CardTitle>
                    <CardDescription>
                      Definisci retention e zone di elaborazione.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <SelectField
                        label="Data region"
                        placeholder="EU-West"
                        options={["EU-West", "US-East", "APAC-Singapore"]}
                      />
                      <SelectField
                        label="Backup"
                        placeholder="Settimanale"
                        options={[
                          "Giornaliero",
                          "Settimanale",
                          "Mensile",
                          "Solo manuale",
                        ]}
                      />
                      <SelectField
                        label="Retention"
                        placeholder="90 giorni"
                        options={["30 giorni", "90 giorni", "180 giorni", "Mai"]}
                      />
                    </div>
                    <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        Data processing note
                      </p>
                      I dati restano all&apos;interno della regione selezionata.
                      Puoi spegnere il logging analitico per le view.
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Micro-interactions</CardTitle>
                    <CardDescription>
                      Scegli come animare gli elementi dinamici.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <LabelMini>Motion tone</LabelMini>
                      <RadioGroup
                        defaultValue="balanced"
                        className="grid grid-cols-1 gap-2"
                      >
                        <RadioOption
                          value="balanced"
                          title="Balanced"
                          description="Transizioni morbide da 200ms"
                        />
                        <RadioOption
                          value="playful"
                          title="Playful"
                          description="Rimbalzi e gradienti evidenti"
                        />
                        <RadioOption
                          value="minimal"
                          title="Minimal"
                          description="Quasi istantaneo, senza overshoot"
                        />
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <LabelMini>Check list</LabelMini>
                      <div className="space-y-2 rounded-xl border bg-card p-3">
                        <CheckboxRow
                          label="Evidenzia la riga selezionata in tabella"
                          defaultChecked
                        />
                        <CheckboxRow
                          label="Mostra glow sugli input attivi"
                          defaultChecked={false}
                        />
                        <CheckboxRow
                          label="Auto espansione dei moduli multi-step"
                          defaultChecked
                        />
                      </div>
                    </div>
                    <Button className="w-full" variant="secondary">
                      Applica preset animazioni
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Release track</CardTitle>
                    <CardDescription>
                      Scegli il ritmo di aggiornamento e feature beta.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ToggleRow
                      title="Beta features"
                      description="Nuove UI e componenti animate prima del rilascio."
                      checked={toggles.betaFeatures}
                      onChange={(val) =>
                        setToggles((prev) => ({ ...prev, betaFeatures: val }))
                      }
                    />
                    <Textarea
                      placeholder="Note interne o reminder su cosa testare..."
                      className="min-h-[96px]"
                    />
                    <Button className="w-full">Salva impostazioni app</Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="account"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="grid gap-4 xl:grid-cols-[1.5fr_1fr]"
            >
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Profilo</CardTitle>
                    <CardDescription>
                      Aggiorna dati, sicurezza e preferenze account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <LabeledInput
                        label="Nome completo"
                        placeholder="Mario Rossi"
                        defaultValue="Tiziano Di Felice"
                      />
                      <LabeledInput
                        label="Ruolo"
                        placeholder="Es. Operations"
                        defaultValue="Product & Ops"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <LabeledInput
                        label="Email"
                        type="email"
                        placeholder="you@example.com"
                        defaultValue="tiziano@reglo.ai"
                      />
                      <LabeledInput
                        label="Telefono"
                        placeholder="+39 ..."
                        defaultValue="+39 333 123 4567"
                      />
                    </div>
                    <ToggleRow
                      title="Two-factor"
                      description="Richiedi codice via app o SMS al login."
                      checked={toggles.twoFactor}
                      onChange={(val) =>
                        setToggles((prev) => ({ ...prev, twoFactor: val }))
                      }
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <SelectField
                        label="Lingua"
                        placeholder="Italiano"
                        options={["Italiano", "English", "Deutsch"]}
                      />
                      <SelectField
                        label="Formato data"
                        placeholder="DD/MM/YYYY"
                        options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Notifiche personali</CardTitle>
                    <CardDescription>
                      Mix di toggle, checkbox e select sull&apos;account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <ToggleRow
                        title="Digest settimanale"
                        description="Inviato il lunedì alle 9:00."
                        checked
                        onChange={() => void 0}
                      />
                      <ToggleRow
                        title="Alert critici"
                        description="Sempre attivi per incidenti e SLA."
                        checked
                        onChange={() => void 0}
                      />
                    </div>
                    <div className="space-y-2">
                      <LabelMini>Canali</LabelMini>
                      <div className="flex flex-wrap gap-2">
                        {["Email", "Push", "Slack", "SMS"].map((item) => (
                          <Badge key={item} variant="outline" className="px-3">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <LabelMini>Zona oraria</LabelMini>
                      <Select defaultValue="Europe/Rome">
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleziona la timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Europe/Rome">
                            Europe/Rome (CET)
                          </SelectItem>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="America/New_York">
                            America/New York
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="border-destructive/30">
                  <CardHeader>
                    <CardTitle>Sessioni &amp; Accessi</CardTitle>
                    <CardDescription>
                      Controlla le sessioni attive e le policy di login.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CheckboxRow
                      label="Logga nuove sessioni e invia recap"
                      defaultChecked
                    />
                    <CheckboxRow
                      label="Blocca device non riconosciuti"
                      defaultChecked
                    />
                    <div className="space-y-2">
                      <LabelMini>Session timeout</LabelMini>
                      <Select defaultValue="45">
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Durata" />
                        </SelectTrigger>
                        <SelectContent>
                          {["15", "30", "45", "60"].map((val) => (
                            <SelectItem key={val} value={val}>
                              {val} minuti
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="secondary" className="w-full">
                      Chiudi tutte le sessioni
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Note account</CardTitle>
                    <CardDescription>
                      Spazio libero per note o action item.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      placeholder="Es. verifica 2FA entro venerdì, aggiorna email di recupero..."
                      className="min-h-[120px]"
                    />
                    <Button className="w-full">Aggiorna account</Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ClientPageWrapper>
  );
}

function LabeledInput({
  label,
  ...props
}: {
  label: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <LabelMini>{label}</LabelMini>
      <Input {...props} />
    </div>
  );
}

function LabelMini({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase text-muted-foreground">{children}</p>;
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card px-3 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <SimpleToggle checked={checked ?? false} onChange={onChange} />
    </div>
  );
}

function SimpleToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition",
        checked
          ? "border-primary/40 bg-primary/20"
          : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute left-1 h-4 w-4 rounded-full bg-background shadow-sm transition-all",
          checked && "translate-x-[1.15rem] bg-primary shadow-sm",
        )}
      />
    </button>
  );
}

function RangeRow({
  value,
  onChange,
  min = 0,
  max = 100,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{value}{suffix}</span>
        <span className="text-muted-foreground text-xs">aggiornamento UI</span>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 rounded-full bg-muted" />
        <motion.div
          className="pointer-events-none absolute inset-y-0 rounded-full bg-primary/60"
          style={{ width: `${percentage}%` }}
          initial={false}
        />
        <motion.div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
          style={{ left: `calc(${percentage}% - 8px)` }}
          initial={false}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative z-10 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  defaultChecked,
}: {
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border px-3 py-2">
      <Checkbox defaultChecked={defaultChecked} />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function RadioOption({
  value,
  title,
  description,
}: {
  value: string;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border px-3 py-2">
      <RadioGroupItem value={value} />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}

function SelectField({
  label,
  options,
  placeholder,
}: {
  label: string;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <LabelMini>{label}</LabelMini>
      <Select defaultValue={options[0]}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TabsSwitcher({
  items,
  activeIndex,
  onChange,
}: {
  items: TabItem[];
  activeIndex: number;
  onChange: (index: number) => void;
}) {
  const width = 100 / items.length;

  return (
    <div className="w-full max-w-lg">
      <div
        role="tablist"
        aria-label="Impostazioni"
        className="relative flex items-center rounded-xl border bg-muted/60 p-1"
      >
        <motion.div
          className="absolute top-1 bottom-1 rounded-lg border border-primary/30 bg-background shadow-sm"
          style={{ width: `${width}%`, left: 0 }}
          animate={{ left: `${activeIndex * width}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.7 }}
        />
        {items.map((item, index) => (
          <button
            key={`${item.value}-${index}`}
            role="tab"
            aria-selected={activeIndex === index}
            className={cn(
              "relative z-10 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none",
              activeIndex === index
                ? "text-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onChange(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SettingsPage;
