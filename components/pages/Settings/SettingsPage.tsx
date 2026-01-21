"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { cn } from "@/lib/utils";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { useSession } from "next-auth/react";
import { useAtomValue, useSetAtom } from "jotai";
import { updateProfile } from "@/lib/actions/user.actions";
import { updateCompanyName } from "@/lib/actions/company.actions";
import { createCompanyInvite } from "@/lib/actions/invite.actions";
import { MailPlus, UploadCloud } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { userAvatarUrlAtom, userRefreshAtom, userSessionAtom } from "@/atoms/user.store";
import { companyAtom, companyRefreshAtom } from "@/atoms/company.store";
import {
  integrationConnectionsAtom,
  integrationsRefreshAtom,
} from "@/atoms/integrations.store";

type TabKey = "account" | "company" | "integrations";
type TabItem = { label: string; value: TabKey };

const pronounOptions = ["Lei/Lei", "Lui/Lui", "Loro/Loro"];
const genderOptions = ["Donna", "Uomo", "Non-binario", "Preferisco non dirlo"];
const languageOptions = ["Italiano", "English", "Deutsch"];
const dataRegionOptions = ["EU-West", "US-East", "APAC-Singapore"];
const sessionTimeoutOptions = ["15", "30", "45", "60"];
const integrations = [
  {
    id: "slack",
    name: "Slack",
    description: "Messaggi, thread, upload file e notifiche di workflow.",
    helper: "Installa la Reglo Slack App nel workspace aziendale.",
  },
  {
    id: "fatture-in-cloud",
    name: "Fatture in Cloud",
    description: "Crea fatture, aggiorna stati, genera PDF e sincronizza clienti.",
    helper: "Collega l'account TeamSystem autorizzato della company.",
  },
  {
    id: "doc-manager",
    name: "Doc Manager",
    description: "Azioni interne: upload, firma, aggiornamento stato e archiviazione.",
    helper: "Disponibile di default per ogni company.",
  },
] as const;

const integrationLabelMap: Record<string, string> = {
  slack: "Slack",
  "fatture-in-cloud": "Fatture in Cloud",
};

export function SettingsPage(): React.ReactElement {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const { update } = useSession();
  const session = useAtomValue(userSessionAtom);
  const avatarUrl = useAtomValue(userAvatarUrlAtom);
  const company = useAtomValue(companyAtom);
  const integrationConnections = useAtomValue(integrationConnectionsAtom);
  const setUserRefresh = useSetAtom(userRefreshAtom);
  const setCompanyRefresh = useSetAtom(companyRefreshAtom);
  const setIntegrationsRefresh = useSetAtom(integrationsRefreshAtom);
  const toast = useFeedbackToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const didInitName = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [isLogoUploading, setIsLogoUploading] = useState(false);

  const [accountForm, setAccountForm] = useState({
    firstName: "",
    lastName: "",
    pronouns: pronounOptions[0],
    gender: genderOptions[0],
    language: languageOptions[0],
  });

  const [notificationPrefs, setNotificationPrefs] = useState({
    weeklyDigest: true,
    criticalAlerts: true,
    mentions: false,
  });

  const [companyForm, setCompanyForm] = useState({
    companyName: "Reglo S.r.l.",
    dataRegion: dataRegionOptions[0],
  });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "member",
  });
  const [isInviteSending, setIsInviteSending] = useState(false);
  const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null);
  const [ficEntities, setFicEntities] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [ficEntityLoading, setFicEntityLoading] = useState(false);
  const [ficEntityError, setFicEntityError] = useState<string | null>(null);
  const [ficSelectedEntityId, setFicSelectedEntityId] = useState<string>("");
  const [ficSavingEntity, setFicSavingEntity] = useState(false);
  const [ficManualEntityId, setFicManualEntityId] = useState("");
  const [ficManualEntityName, setFicManualEntityName] = useState("");

  const [sessionAccess, setSessionAccess] = useState({
    logSessions: true,
    blockUnknownDevices: true,
    sessionTimeout: sessionTimeoutOptions[2],
  });

  const companyId = company?.id ?? null;
  const companyRole = company?.role ?? null;
  const companyLogoUrl = company?.logoUrl ?? null;
  const isAdmin = companyRole === "admin";
  const avatarInitials = useMemo(() => {
    const name = session?.user?.name?.trim();
    if (!name) return "RG";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [session?.user?.name]);

  const integrationState = useMemo(() => {
    if (!integrationConnections) return {};
    const map: Record<string, { status: string; displayName?: string | null }> = {};
    integrationConnections.forEach((connection) => {
      map[connection.provider] = {
        status: connection.status,
        displayName: connection.displayName,
      };
    });
    return map;
  }, [integrationConnections]);
  const isFicConnected = integrationState["fatture-in-cloud"]?.status === "connected";

  const tabItems = useMemo<TabItem[]>(() => {
    const items: TabItem[] = [{ label: "Account", value: "account" }];
    if (isAdmin) {
      items.push(
        { label: "Company", value: "company" },
        { label: "Integrations", value: "integrations" },
      );
    }
    return items;
  }, [isAdmin]);
  const activeTab = tabItems[activeTabIndex]?.value ?? "account";

  useEffect(() => {
    if (didInitName.current) return;
    const fullName = session?.user?.name?.trim();
    if (!fullName) return;
    const parts = fullName.split(" ");
    const firstName = parts.shift() ?? "";
    const lastName = parts.join(" ");
    setAccountForm((prev) => ({
      ...prev,
      firstName,
      lastName,
    }));
    didInitName.current = true;
  }, [session?.user?.name]);

  useEffect(() => {
    if (activeTabIndex >= tabItems.length) {
      setActiveTabIndex(0);
    }
  }, [activeTabIndex, tabItems.length]);

  useEffect(() => {
    const success = searchParams.get("integrationSuccess");
    const error = searchParams.get("integrationError");
    if (!success && !error) return;
    if (success) {
      const label = integrationLabelMap[success] ?? success;
      toast.success({
        title: "Integrazione connessa",
        description: `Connessione completata per ${label}.`,
      });
      const integrationsIndex = tabItems.findIndex(
        (tab) => tab.value === "integrations",
      );
      if (integrationsIndex >= 0) {
        setActiveTabIndex(integrationsIndex);
      }
      setIntegrationsRefresh(true);
    }
    if (error) {
      const label = integrationLabelMap[error] ?? error;
      toast.error({
        title: "Connessione fallita",
        description: `Non e' stato possibile collegare ${label}.`,
      });
      const integrationsIndex = tabItems.findIndex(
        (tab) => tab.value === "integrations",
      );
      if (integrationsIndex >= 0) {
        setActiveTabIndex(integrationsIndex);
      }
    }
    router.replace(pathname);
  }, [searchParams, toast, router, pathname, setIntegrationsRefresh, tabItems]);

  useEffect(() => {
    if (!isFicConnected) {
      setFicEntities([]);
      setFicEntityLoading(false);
      setFicEntityError(null);
      setFicSelectedEntityId("");
      return;
    }

    const controller = new AbortController();
    let active = true;

    setFicEntityLoading(true);
    setFicEntityError(null);

    fetch("/api/integrations/fatture-in-cloud/entities", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          data?: Array<{ value: string; label: string }>;
          selectedId?: string | null;
          message?: string;
        };
        if (!active) return { options: [], selectedId: "" };
        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Impossibile caricare le aziende FIC.");
        }
        return {
          options: payload.data ?? [],
          selectedId: payload.selectedId ?? "",
        };
      })
      .then(({ options, selectedId }) => {
        if (!active) return;
        setFicEntities(options);
        setFicSelectedEntityId(selectedId);
      })
      .catch((error) => {
        if (!active) return;
        const err = error as Error;
        if (err.name === "AbortError") return;
        setFicEntities([]);
        setFicEntityError(err.message ?? "Impossibile caricare le aziende FIC.");
      })
      .finally(() => {
        if (!active) return;
        setFicEntityLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isFicConnected]);

  useEffect(() => {
    if (ficSelectedEntityId) {
      setFicManualEntityId(ficSelectedEntityId);
    }
  }, [ficSelectedEntityId]);

  useEffect(() => {
    if (!company) return;
    setCompanyForm((prev) => ({
      ...prev,
      companyName: company.name,
    }));
  }, [company]);

  const handleDisconnect = async (providerKey: string) => {
    setDisconnectingProvider(providerKey);
    try {
      const res = await fetch(`/api/integrations/${providerKey}/disconnect`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Disconnect failed.");
      }
      toast.success({
        title: "Integrazione disconnessa",
        description: "La connessione e' stata rimossa.",
      });
      setIntegrationsRefresh(true);
    } catch (error) {
      toast.error({
        title: "Errore disconnessione",
        description:
          error instanceof Error ? error.message : "Impossibile disconnettere.",
      });
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const handleAccountSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const firstName = accountForm.firstName.trim();
    const lastName = accountForm.lastName.trim();
    const email = session?.user?.email;

    if (!firstName || !lastName) {
      toast.error({
        description: "Inserisci nome e cognome.",
      });
      return;
    }

    if (!email) {
      toast.error({
        description: "Email mancante nella sessione.",
      });
      return;
    }

    const res = await updateProfile({
      name: `${firstName} ${lastName}`.trim(),
      email,
    });

    if (!res.success) {
      toast.error({
        description: res.message,
      });
      return;
    }

    if (session) {
      await update({
        ...session,
        user: {
          ...session.user,
          name: `${firstName} ${lastName}`.trim(),
        },
      });
    }
    setUserRefresh(true);

    toast.success({
      title: "Salvataggio completato",
      description: "Le impostazioni account sono state aggiornate.",
    });
  };

  const handleCompanySave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = companyForm.companyName.trim();

    if (!name) {
      toast.error({
        description: "Inserisci il nome della company.",
      });
      return;
    }

    if (!companyId) {
      toast.error({
        description: "Company non trovata.",
      });
      return;
    }

    const res = await updateCompanyName({
      companyId,
      name,
    });

    if (!res.success) {
      toast.error({
        description: res.message,
      });
      return;
    }
    setCompanyRefresh(true);

    toast.success({
      title: "Salvataggio completato",
      description: "Le impostazioni company sono state aggiornate.",
    });
  };

  const handleAvatarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type) {
      toast.error({ description: "Unsupported file type." });
      return;
    }

    setIsAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/uploads/avatar", {
        method: "POST",
        body: formData,
      });
      const upload = await uploadRes.json();

      if (!uploadRes.ok || !upload.success || !upload.data) {
        throw new Error(upload.message ?? "Upload failed.");
      }

      if (session) {
        await update({
          ...session,
          user: {
            ...session.user,
            image: upload.data.key,
          },
        });
      }
      setUserRefresh(true);

      toast.success({
        title: "Upload completed",
        description: "Profile image updated successfully.",
      });
    } catch (error) {
      toast.error({
        description:
          error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleLogoFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!companyId) {
      toast.error({ description: "Company not found." });
      return;
    }

    if (!file.type) {
      toast.error({ description: "Unsupported file type." });
      return;
    }

    setIsLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);

      const uploadRes = await fetch("/api/uploads/company-logo", {
        method: "POST",
        body: formData,
      });
      const upload = await uploadRes.json();

      if (!uploadRes.ok || !upload.success || !upload.data) {
        throw new Error(upload.message ?? "Upload failed.");
      }

      setCompanyRefresh(true);

      toast.success({
        title: "Upload completed",
        description: "Company logo updated successfully.",
      });
    } catch (error) {
      toast.error({
        description:
          error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setIsLogoUploading(false);
    }
  };

  const handleInviteSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!companyId) {
      toast.error({ description: "Company not found." });
      return;
    }

    const email = inviteForm.email.trim();
    if (!email) {
      toast.error({ description: "Enter an email address." });
      return;
    }

    setIsInviteSending(true);
    try {
      const res = await createCompanyInvite({
        companyId,
        email,
        role: inviteForm.role as "member" | "admin",
      });

      if (!res.success) {
        throw new Error(res.message ?? "Invite failed.");
      }

      setInviteForm((prev) => ({ ...prev, email: "" }));
      toast.success({
        title: "Invite sent",
        description: "The invitation email has been sent.",
      });
    } catch (error) {
      toast.error({
        description:
          error instanceof Error ? error.message : "Invite failed.",
      });
    } finally {
      setIsInviteSending(false);
    }
  };

  return (
    <ClientPageWrapper title="Settings">
      <div className="space-y-6">
        <div className="flex flex-col gap-3">
          <TabsSwitcher
            items={tabItems}
            activeIndex={activeTabIndex}
            onChange={(index) => setActiveTabIndex(index)}
          />
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "account" ? (
            <motion.div
              key="account"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <form onSubmit={handleAccountSave} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile photo</CardTitle>
                    <CardDescription>
                      Upload a profile image to personalize your account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={avatarUrl ?? undefined} alt="Profile" />
                        <AvatarFallback>{avatarInitials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">Profile image</p>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG, or WebP. Max 5MB.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleAvatarFileChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isAvatarUploading}
                      >
                        <UploadCloud className="h-4 w-4" />
                        {isAvatarUploading ? "Uploading..." : "Upload image"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Account</CardTitle>
                    <CardDescription>
                      Modifica i dati personali principali.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <LabeledInput
                        label="Nome"
                        placeholder="Mario"
                        value={accountForm.firstName}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            firstName: event.target.value,
                          }))
                        }
                      />
                      <LabeledInput
                        label="Cognome"
                        placeholder="Rossi"
                        value={accountForm.lastName}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            lastName: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <SelectField
                        label="Pronomi"
                        value={accountForm.pronouns}
                        options={pronounOptions}
                        onChange={(value) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            pronouns: value,
                          }))
                        }
                      />
                      <SelectField
                        label="Genere"
                        value={accountForm.gender}
                        options={genderOptions}
                        onChange={(value) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            gender: value,
                          }))
                        }
                      />
                      <SelectField
                        label="Lingua"
                        value={accountForm.language}
                        options={languageOptions}
                        onChange={(value) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            language: value,
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Notifiche personali</CardTitle>
                    <CardDescription>
                      Preferenze di notifica salvate con la CTA unica.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ToggleRow
                      title="Digest settimanale"
                      description="Riepilogo ogni lunedì alle 9:00."
                      checked={notificationPrefs.weeklyDigest}
                      onChange={(value) =>
                        setNotificationPrefs((prev) => ({
                          ...prev,
                          weeklyDigest: value,
                        }))
                      }
                    />
                    <ToggleRow
                      title="Alert critici"
                      description="Sempre attivi per incidenti e SLA."
                      checked={notificationPrefs.criticalAlerts}
                      onChange={(value) =>
                        setNotificationPrefs((prev) => ({
                          ...prev,
                          criticalAlerts: value,
                        }))
                      }
                    />
                    <ToggleRow
                      title="Menzioni dirette"
                      description="Notifiche quando vieni taggato."
                      checked={notificationPrefs.mentions}
                      onChange={(value) =>
                        setNotificationPrefs((prev) => ({
                          ...prev,
                          mentions: value,
                        }))
                      }
                    />
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button type="submit">Salva impostazioni account</Button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {activeTab === "company" ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Company logo</CardTitle>
                      <CardDescription>
                        Upload a logo to personalize the workspace.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
                          {companyLogoUrl ? (
                            <Image
                              src={companyLogoUrl}
                              alt="Company logo"
                              width={56}
                              height={56}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Logo
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">Company logo</p>
                          <p className="text-xs text-muted-foreground">
                            PNG, JPG, or WebP. Max 5MB.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={handleLogoFileChange}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={isLogoUploading}
                        >
                          <UploadCloud className="h-4 w-4" />
                          {isLogoUploading ? "Uploading..." : "Upload logo"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <form onSubmit={handleCompanySave} className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Company</CardTitle>
                        <CardDescription>
                          Informazioni base dell&apos;azienda.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <LabeledInput
                          label="Nome azienda"
                          placeholder="Reglo S.r.l."
                          value={companyForm.companyName}
                          onChange={(event) =>
                            setCompanyForm((prev) => ({
                              ...prev,
                              companyName: event.target.value,
                            }))
                          }
                        />
                        <SelectField
                          label="Data region"
                          value={companyForm.dataRegion}
                          options={dataRegionOptions}
                          onChange={(value) =>
                            setCompanyForm((prev) => ({
                              ...prev,
                              dataRegion: value,
                            }))
                          }
                        />
                      </CardContent>
                    </Card>

                    <Card className="border-primary/15">
                      <CardHeader>
                        <CardTitle>Sessioni &amp; Accessi</CardTitle>
                        <CardDescription>
                          Policy di accesso e monitoraggio sessioni.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <CheckboxRow
                          label="Logga nuove sessioni e invia recap"
                          checked={sessionAccess.logSessions}
                          onChange={(value) =>
                            setSessionAccess((prev) => ({
                              ...prev,
                              logSessions: value,
                            }))
                          }
                        />
                        <CheckboxRow
                          label="Blocca device non riconosciuti"
                          checked={sessionAccess.blockUnknownDevices}
                          onChange={(value) =>
                            setSessionAccess((prev) => ({
                              ...prev,
                              blockUnknownDevices: value,
                            }))
                          }
                        />
                        <SelectField
                          label="Session timeout (min)"
                          value={sessionAccess.sessionTimeout}
                          options={sessionTimeoutOptions}
                          onChange={(value) =>
                            setSessionAccess((prev) => ({
                              ...prev,
                              sessionTimeout: value,
                            }))
                          }
                        />
                      </CardContent>
                    </Card>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <Button type="submit">Salva impostazioni company</Button>
                    </div>
                  </form>

                  <form onSubmit={handleInviteSubmit} className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Invite team members</CardTitle>
                        <CardDescription>
                          Send a simple invite to join your company.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
                          <LabeledInput
                            label="Email"
                            placeholder="name@company.com"
                            value={inviteForm.email}
                            onChange={(event) =>
                              setInviteForm((prev) => ({
                                ...prev,
                                email: event.target.value,
                              }))
                            }
                          />
                          <div className="space-y-2">
                            <LabelMini>Role</LabelMini>
                            <Select
                              value={inviteForm.role}
                              onValueChange={(value) =>
                                setInviteForm((prev) => ({
                                  ...prev,
                                  role: value,
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <Button type="submit" disabled={isInviteSending}>
                        <MailPlus className="h-4 w-4" />
                        {isInviteSending ? "Sending..." : "Send invite"}
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="space-y-4">
                  <Card className="border-primary/15 bg-muted/30">
                    <CardHeader>
                      <CardTitle>Integrazioni</CardTitle>
                      <CardDescription>
                        Collega i servizi esterni per rendere i workflow operativi.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      Ogni integrazione e&apos; separata per company e richiede
                      autorizzazioni dedicate.
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {integrations.map((integration) => {
                      const providerKey = integration.id;
                      const connection = integrationState[providerKey];
                      const isBuiltIn = providerKey === "doc-manager";
                      const isConnected = connection?.status === "connected";
                      const badgeLabel = isBuiltIn
                        ? "Integrata"
                        : isConnected
                          ? "Connessa"
                          : "Non collegata";
                      const badgeVariant = isBuiltIn || isConnected ? "accent" : "base";
                      return (
                        <Card key={integration.id} className="flex h-full flex-col">
                          <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                              <CardTitle>{integration.name}</CardTitle>
                              <BadgeMini variant={badgeVariant}>
                                {badgeLabel}
                              </BadgeMini>
                            </div>
                            <CardDescription>{integration.description}</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <p className="text-xs text-muted-foreground">
                              {integration.helper}
                            </p>
                            {connection?.displayName && (
                              <p className="text-xs text-muted-foreground">
                                Workspace: {connection.displayName}
                              </p>
                            )}
                            {providerKey === "fatture-in-cloud" && isConnected ? (
                              <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                  Azienda FIC
                                </p>
                                <Select
                                  value={ficSelectedEntityId}
                                  onValueChange={async (value) => {
                                    setFicSelectedEntityId(value);
                                    if (!value) return;
                                    const selected = ficEntities.find(
                                      (entity) => entity.value === value,
                                    );
                                    setFicSavingEntity(true);
                                    const res = await fetch(
                                      "/api/integrations/fatture-in-cloud/entity",
                                      {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          entityId: value,
                                          entityName: selected?.label ?? null,
                                        }),
                                      },
                                    );
                                    setFicSavingEntity(false);
                                    if (!res.ok) {
                                      toast.error({
                                        description:
                                          "Impossibile salvare l'azienda FIC selezionata.",
                                      });
                                    }
                                  }}
                                  disabled={ficEntityLoading || ficSavingEntity}
                                >
                                  <SelectTrigger>
                                    <SelectValue
                                      placeholder={
                                        ficEntityLoading
                                          ? "Caricamento aziende…"
                                          : "Seleziona azienda"
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60 overflow-y-auto">
                                    {ficEntities.map((entity) => (
                                      <SelectItem key={entity.value} value={entity.value}>
                                        {entity.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {ficEntities.length === 0 && !ficEntityLoading ? (
                                  <div className="space-y-2">
                                    <Input
                                      value={ficManualEntityId}
                                      onChange={(event) =>
                                        setFicManualEntityId(event.target.value)
                                      }
                                      placeholder="Incolla l'ID azienda FIC"
                                    />
                                    <Input
                                      value={ficManualEntityName}
                                      onChange={(event) =>
                                        setFicManualEntityName(event.target.value)
                                      }
                                      placeholder="Nome azienda (opzionale)"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={async () => {
                                        if (!ficManualEntityId.trim()) {
                                          toast.error({
                                            description: "Inserisci un ID azienda valido.",
                                          });
                                          return;
                                        }
                                        setFicSavingEntity(true);
                                        const res = await fetch(
                                          "/api/integrations/fatture-in-cloud/entity",
                                          {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                              entityId: ficManualEntityId.trim(),
                                              entityName: ficManualEntityName.trim() || null,
                                            }),
                                          },
                                        );
                                        setFicSavingEntity(false);
                                        if (!res.ok) {
                                          toast.error({
                                            description:
                                              "Impossibile salvare l'azienda FIC selezionata.",
                                          });
                                          return;
                                        }
                                        setFicSelectedEntityId(ficManualEntityId.trim());
                                        toast.success({
                                          description: "Azienda FIC salvata.",
                                        });
                                      }}
                                      disabled={ficSavingEntity}
                                    >
                                      Salva ID azienda
                                    </Button>
                                    <p className="text-xs text-muted-foreground">
                                      Puoi recuperare l&apos;ID dalla URL di FIC (es.
                                      /c/ID_AZIENDA).
                                    </p>
                                  </div>
                                ) : null}
                                {ficEntityError ? (
                                  <p className="text-xs text-rose-500">{ficEntityError}</p>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    La selezione viene usata dai workflow per creare fatture.
                                  </p>
                                )}
                              </div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                              {isBuiltIn ? (
                                <Button variant="outline" disabled>
                                  Disponibile
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    onClick={() => {
                                      if (isConnected) return;
                                      window.open(
                                        `/api/integrations/${providerKey}/connect`,
                                        "_blank",
                                        "noopener,noreferrer"
                                      );
                                    }}
                                    variant="outline"
                                    disabled={isConnected}
                                  >
                                    {isConnected ? "Connessa" : "Connetti"}
                                  </Button>
                                  {isConnected ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => handleDisconnect(providerKey)}
                                      disabled={disconnectingProvider === providerKey}
                                    >
                                      {disconnectingProvider === providerKey
                                        ? "Disconnettendo..."
                                        : "Disconnetti"}
                                    </Button>
                                  ) : null}
                                </>
                              )}
                              <Button variant="ghost" disabled>
                                Dettagli
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
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

function BadgeMini({
  children,
  variant = "base",
}: {
  children: React.ReactNode;
  variant?: "base" | "accent";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold",
        variant === "accent"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-background text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
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

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border px-3 py-2">
      <Checkbox checked={checked} onCheckedChange={() => onChange(!checked)} />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <LabelMini>{label}</LabelMini>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={label} />
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
          className="absolute bottom-1 top-1 rounded-lg border border-primary/30 bg-background shadow-sm"
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
