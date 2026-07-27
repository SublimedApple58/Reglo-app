"use client";

/**
 * AgendaPauseNewsDialog — annuncio "Novità" (pausa richieste agenda).
 *
 * Due livelli, 1:1 dal prototipo News.html:
 *  1. SPLASH: card 920×788 (testo + CTA "Scopri di più" a sinistra, video
 *     Reglo a destra). È ciò che compare al primo accesso web.
 *  2. DETTAGLIO: modale "Novità" 640px con i 3 moduli in arrivo (Reglo Road,
 *     Rinnovi, Guide certificate), il tasto "Fai una richiesta" e "Consiglia
 *     qualcosa" — entrambi salvano su NewsFeedback + notificano il team.
 *
 * Mostrato solo agli utenti web dell'autoscuola (titolari/segretarie): il gating
 * "una volta per dispositivo" vive in AutoscuoleShell (localStorage).
 */

import React from "react";
import { createPortal } from "react-dom";

import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import { submitNewsFeedback } from "@/lib/actions/support.actions";
import { RegloEmbed, RegloClipRoad, RegloClipRinnovi, RegloClipGuide } from "./RegloClips";

type ModuleKey = "road" | "rinnovi" | "guide";

function StepRow({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#eeeef4",
          color: "#1a1a2e",
          fontSize: 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 500, color: "#444", lineHeight: 1.5, paddingTop: 1 }}>{children}</div>
    </div>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="#222" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function SentCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "8px 0 4px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/news/richiesta-inviata.png"
        alt=""
        style={{ width: 84, height: 84, objectFit: "contain", display: "block", margin: "0 auto 16px", mixBlendMode: "multiply" }}
      />
      <div style={{ fontSize: 19, fontWeight: 700, color: "#222", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#929292" }}>{subtitle}</div>
    </div>
  );
}

export function AgendaPauseNewsDialog({
  open,
  startWith = "splash",
  onClose,
}: {
  open: boolean;
  startWith?: "splash" | "detail";
  onClose: () => void;
}) {
  const toast = useFeedbackToast();
  const [view, setView] = React.useState<"splash" | "detail" | "closed">("closed");

  // Richiesta ("Fai una richiesta")
  const [reqOpen, setReqOpen] = React.useState(false);
  const [reqText, setReqText] = React.useState("");
  const [reqSent, setReqSent] = React.useState(false);
  const [reqBusy, setReqBusy] = React.useState(false);

  // Consiglio ("Consiglia qualcosa")
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [mods, setMods] = React.useState<Record<ModuleKey, boolean>>({ road: false, rinnovi: false, guide: false });
  const [suggestText, setSuggestText] = React.useState("");
  const [suggestSent, setSuggestSent] = React.useState(false);
  const [suggestBusy, setSuggestBusy] = React.useState(false);

  const resetForms = React.useCallback(() => {
    setReqOpen(false);
    setReqText("");
    setReqSent(false);
    setReqBusy(false);
    setSuggestOpen(false);
    setMods({ road: false, rinnovi: false, guide: false });
    setSuggestText("");
    setSuggestSent(false);
    setSuggestBusy(false);
  }, []);

  React.useEffect(() => {
    if (open) {
      setView(startWith);
      resetForms();
    } else {
      setView("closed");
    }
  }, [open, startWith, resetForms]);

  const closeDetail = React.useCallback(() => {
    if (startWith === "splash") setView("splash");
    else onClose();
  }, [startWith, onClose]);

  React.useEffect(() => {
    if (view === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view === "detail") closeDetail();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, closeDetail, onClose]);

  const sendRequest = async () => {
    if (reqBusy || reqText.trim().length === 0) return;
    setReqBusy(true);
    const res = await submitNewsFeedback({ type: "request", modules: [], message: reqText.trim() });
    setReqBusy(false);
    if (res.success) setReqSent(true);
    else toast.error({ description: res.message ?? "Invio non riuscito. Riprova." });
  };

  const sendSuggest = async () => {
    if (suggestBusy || suggestText.trim().length === 0) return;
    const modules = (Object.keys(mods) as ModuleKey[]).filter((k) => mods[k]);
    setSuggestBusy(true);
    const res = await submitNewsFeedback({ type: "suggestion", modules, message: suggestText.trim() });
    setSuggestBusy(false);
    if (res.success) setSuggestSent(true);
    else toast.error({ description: res.message ?? "Invio non riuscito. Riprova." });
  };

  if (view === "closed" || typeof document === "undefined") return null;

  const chipStyle = (on: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderRadius: 50,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
    transition: "all 0.15s",
    border: on ? "1.5px solid #9fc3f0" : "1.5px solid #dcdce4",
    background: on ? "#cfe0fb" : "#ffffff",
    color: on ? "#1a2b45" : "#555555",
  });

  const FONT = "var(--font-geist-sans), Figtree, -apple-system, sans-serif";

  return createPortal(
    <>
      {/* ══════════ SPLASH ══════════ */}
      {view === "splash" && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 600,
            background: "rgba(20,20,26,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: FONT,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            data-testid="news-splash"
            style={{
              position: "relative",
              width: 920,
              maxWidth: "100%",
              height: 788,
              maxHeight: "calc(100vh - 48px)",
              background: "#ffffff",
              borderRadius: 26,
              boxShadow: "0 40px 100px rgba(0,0,0,0.28)",
              overflow: "hidden",
              display: "grid",
              gridTemplateColumns: "51% 49%",
            }}
          >
            {/* LEFT */}
            <div style={{ padding: "56px 52px 46px", display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1 }} />
              <div
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  padding: "7px 15px",
                  background: "#cfe0fb",
                  borderRadius: 9,
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#1a2b45",
                  marginBottom: 26,
                }}
              >
                News
              </div>
              <h1 style={{ margin: "0 0 30px", fontWeight: 800, fontSize: 46, lineHeight: 1.12, letterSpacing: "-1.4px", color: "#141414" }}>
                Richieste sull&apos;agenda sospese per un po&apos;
              </h1>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 400, lineHeight: 1.5, color: "#3a3a3a", maxWidth: 360 }}>
                Stanno arrivando tantissime richieste sull&apos;agenda da tutte le autoscuole. Le mettiamo in pausa per concentrarci su ciò che conta di
                più adesso: Reglo Road e i rinnovi.
              </p>
              <div style={{ flex: 1.4 }} />
              <button
                type="button"
                onClick={() => setView("detail")}
                style={{
                  width: "100%",
                  padding: 20,
                  background: "#1a1a2e",
                  border: "none",
                  borderRadius: 15,
                  color: "#ffffff",
                  fontFamily: FONT,
                  fontSize: 20,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Scopri di più
              </button>
            </div>

            {/* RIGHT */}
            <div style={{ position: "relative", overflow: "hidden", background: "#434a5c" }}>
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi"
                style={{
                  position: "absolute",
                  top: 20,
                  right: 20,
                  width: 32,
                  height: 32,
                  border: "none",
                  borderRadius: "50%",
                  background: "#f7f7f7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  zIndex: 6,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="#222" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <div style={{ position: "absolute", inset: 0 }}>
                <RegloEmbed />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ DETTAGLIO (NOVITÀ) ══════════ */}
      {view === "detail" && (
        <div
          onClick={closeDetail}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 620,
            background: "rgba(20,20,26,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 24px",
            fontFamily: FONT,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            data-testid="news-detail"
            style={{
              background: "#fff",
              borderRadius: 20,
              width: 640,
              maxWidth: "100%",
              maxHeight: "calc(100vh - 64px)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "17px 24px",
                borderBottom: "1px solid #f0f0f0",
                background: "#fff",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#929292", letterSpacing: "0.2px" }}>Novità</span>
              <button
                type="button"
                onClick={closeDetail}
                aria-label="Chiudi"
                style={{
                  width: 30,
                  height: 30,
                  border: "none",
                  borderRadius: "50%",
                  background: "#f5f5f5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="#6a6a6a" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "28px 32px 34px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#929292", marginBottom: 6 }}>17 luglio 2026</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#222", letterSpacing: "-0.4px", marginBottom: 22 }}>
                Richieste sull&apos;agenda in pausa
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#444", lineHeight: 1.6, marginBottom: 26 }}>
                Stanno arrivando tantissime richieste sull&apos;agenda da tutte le autoscuole presenti in Reglo. Abbiamo deciso di mettere in pausa per un
                po&apos; questo aspetto per concentrarci al 100% su <b style={{ fontWeight: 700, color: "#222" }}>3 novità</b> che sappiamo che
                apprezzerete.
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#222", marginBottom: 16 }}>Cosa cambia</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 26 }}>
                <StepRow n={1}>
                  Le nuove richieste sull&apos;agenda sono <b style={{ fontWeight: 700, color: "#222" }}>temporaneamente sospese</b>.
                </StepRow>
                <StepRow n={2}>
                  Qualsiasi <b style={{ fontWeight: 700, color: "#222" }}>bug o malfunzionamento</b> verrà preso in considerazione, per garantire il
                  normale svolgimento dell&apos;app.
                </StepRow>
                <StepRow n={3}>
                  Potrete comunque fare richieste con il <b style={{ fontWeight: 700, color: "#222" }}>tasto qui sotto</b>: verranno tutte raccolte e
                  svolte dopo il <b style={{ fontWeight: 700, color: "#222" }}>15 agosto</b>.
                </StepRow>
              </div>

              {/* Fai una richiesta */}
              <div style={{ display: "flex", gap: 10, marginBottom: reqOpen ? 18 : 30 }}>
                <div
                  onClick={() => setReqOpen((v) => !v)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "13px 22px",
                    background: "#fff",
                    border: "1.5px solid #dcdce4",
                    borderRadius: 14,
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#222",
                    cursor: "pointer",
                  }}
                >
                  <PlusIcon />
                  Fai una richiesta
                </div>
              </div>

              {reqOpen && (
                <div style={{ background: "#f7f7f9", borderRadius: 16, padding: 20, marginBottom: 18 }}>
                  {!reqSent ? (
                    <>
                      <textarea
                        value={reqText}
                        onChange={(e) => setReqText(e.target.value)}
                        placeholder="Scrivi qui la tua richiesta..."
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "12px 14px",
                          minHeight: 96,
                          resize: "none",
                          background: "#ffffff",
                          border: "1.5px solid #e2e2ea",
                          borderRadius: 12,
                          fontFamily: FONT,
                          fontSize: 14.5,
                          color: "#222",
                          lineHeight: 1.5,
                          outline: "none",
                          marginBottom: 14,
                        }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => void sendRequest()}
                          disabled={reqBusy || reqText.trim().length === 0}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 84,
                            padding: "12px 24px",
                            background: "#1a1a2e",
                            border: "none",
                            borderRadius: 12,
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#fff",
                            fontFamily: FONT,
                            cursor: reqBusy || reqText.trim().length === 0 ? "default" : "pointer",
                            opacity: reqText.trim().length === 0 ? 0.5 : 1,
                          }}
                        >
                          {reqBusy ? <LoadingDots className="min-h-[1em]" /> : "Invia"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <SentCard title="Richiesta inviata!" subtitle="La raccogliamo e la lavoriamo dopo il 15 agosto." />
                  )}
                </div>
              )}

              <div style={{ fontSize: 15, fontWeight: 500, color: "#444", lineHeight: 1.6, marginBottom: 22 }}>
                Grazie per la pazienza — stiamo costruendo cose importanti.
              </div>
              <div style={{ borderTop: "1px solid #f0f0f0", marginBottom: 24 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "#929292", marginBottom: 20 }}>Dai un&apos;occhiata a cosa bolle in pentola</div>

              {/* Reglo Road */}
              <div style={{ fontSize: 20, fontWeight: 700, color: "#222", letterSpacing: "-0.3px", marginBottom: 14 }}>Reglo Road</div>
              <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 18, background: "#eceef2" }}>
                <RegloClipRoad />
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#444", lineHeight: 1.6, marginBottom: 30 }}>
                Quando un istruttore segnerà che la guida è in corso, l&apos;app <b style={{ fontWeight: 700, color: "#222" }}>registrerà in tempo reale
                il tracciato</b> svolto durante la lezione o l&apos;esame. Sarà possibile aggiungere note e{" "}
                <b style={{ fontWeight: 700, color: "#222" }}>segnare errori, incidenti o altre segnalazioni</b> lungo la strada.
              </div>

              {/* Reglo Rinnovi */}
              <div style={{ fontSize: 20, fontWeight: 700, color: "#222", letterSpacing: "-0.3px", marginBottom: 14 }}>Reglo Rinnovi</div>
              <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 18, background: "#eceef2" }}>
                <RegloClipRinnovi />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                <StepRow n={1}>
                  Patente e foto della persona si inviano dall&apos;app: se una foto non va bene, il software{" "}
                  <b style={{ fontWeight: 700, color: "#222" }}>chiede di rifarla</b>.
                </StepRow>
                <StepRow n={2}>
                  Le patologie si raccolgono prima della visita: il software le <b style={{ fontWeight: 700, color: "#222" }}>analizza e avvisa in
                  anticipo</b>, per evitare rinnovi negati o attese inutili.
                </StepRow>
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#444", lineHeight: 1.6, marginBottom: 30 }}>
                Stiamo pensando anche a una soluzione dedicata per la <b style={{ fontWeight: 700, color: "#222" }}>spedizione della patente</b>, per
                evitare smarrimenti e ritiri mancati. Abbiamo anche altre idee per questa funzione, ma le vedrete in futuro.
              </div>

              {/* Guide certificate */}
              <div style={{ fontSize: 20, fontWeight: 700, color: "#222", letterSpacing: "-0.3px", marginBottom: 14 }}>Guide certificate in automatico</div>
              <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 18, background: "#eceef2" }}>
                <RegloClipGuide />
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#444", lineHeight: 1.6, marginBottom: 30 }}>
                Le guide registrate in Reglo diventeranno <b style={{ fontWeight: 700, color: "#222" }}>certificate in automatico sul Portale della
                Motorizzazione</b>, senza doverci più mettere mano.
              </div>

              <div style={{ borderTop: "1px solid #f0f0f0", marginBottom: 22 }} />
              <div style={{ fontSize: 15, fontWeight: 500, color: "#444", lineHeight: 1.6, marginBottom: 18 }}>
                Hai in mente altre idee o vuoi aggiungere dei dettagli su un modulo?
                <br />
                &nbsp;<b style={{ fontWeight: 700, color: "#222" }}>Scrivici</b> — leggiamo tutto, parlaci delle difficoltà che riscontri ad oggi con
                questi processi o cosa ti piacerebbe vedere.
              </div>

              {suggestOpen && (
                <div style={{ background: "#f7f7f9", borderRadius: 16, padding: 20, marginBottom: 18 }}>
                  {!suggestSent ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#444", marginBottom: 12 }}>Su quali moduli?</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 18 }}>
                        <div onClick={() => setMods((m) => ({ ...m, road: !m.road }))} style={chipStyle(mods.road)}>
                          Reglo Road
                        </div>
                        <div onClick={() => setMods((m) => ({ ...m, rinnovi: !m.rinnovi }))} style={chipStyle(mods.rinnovi)}>
                          Reglo Rinnovi
                        </div>
                        <div onClick={() => setMods((m) => ({ ...m, guide: !m.guide }))} style={chipStyle(mods.guide)}>
                          Guide certificate
                        </div>
                      </div>
                      <textarea
                        value={suggestText}
                        onChange={(e) => setSuggestText(e.target.value)}
                        placeholder="Raccontaci la tua idea..."
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "12px 14px",
                          minHeight: 90,
                          resize: "none",
                          background: "#ffffff",
                          border: "1.5px solid #e2e2ea",
                          borderRadius: 12,
                          fontFamily: FONT,
                          fontSize: 14.5,
                          color: "#222",
                          lineHeight: 1.5,
                          outline: "none",
                          marginBottom: 14,
                        }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => void sendSuggest()}
                          disabled={suggestBusy || suggestText.trim().length === 0}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 84,
                            padding: "12px 24px",
                            background: "#1a1a2e",
                            border: "none",
                            borderRadius: 12,
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#fff",
                            fontFamily: FONT,
                            cursor: suggestBusy || suggestText.trim().length === 0 ? "default" : "pointer",
                            opacity: suggestText.trim().length === 0 ? 0.5 : 1,
                          }}
                        >
                          {suggestBusy ? <LoadingDots className="min-h-[1em]" /> : "Invia"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <SentCard title="Consiglio inviato!" subtitle="Grazie! Lo abbiamo ricevuto, torneremo presto con novità." />
                  )}
                </div>
              )}

              {!suggestOpen && (
                <div
                  onClick={() => setSuggestOpen(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "13px 24px",
                    background: "#fff",
                    border: "1.5px solid #dcdce4",
                    borderRadius: 14,
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#222",
                    cursor: "pointer",
                  }}
                >
                  <PlusIcon size={17} />
                  Consiglia qualcosa
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
