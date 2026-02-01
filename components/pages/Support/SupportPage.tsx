"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

export function SupportPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic");
  const service = searchParams.get("service");
  const presetMessage = React.useMemo(() => {
    if (topic !== "service-activation") return "";
    const serviceLabel = service ? service.replace(/_/g, " ").toLowerCase() : "un servizio";
    return `Ciao Reglo, vorrei attivare ${serviceLabel} per la mia company.`;
  }, [service, topic]);

  const [message, setMessage] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const toast = useFeedbackToast();

  React.useEffect(() => {
    if (!presetMessage) return;
    setMessage((current) => (current.trim() ? current : presetMessage));
  }, [presetMessage]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) {
      toast.error({ description: "Please add a short description first." });
      return;
    }

    setIsSending(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSending(false);
    setMessage("");
    toast.success({
      title: "Message sent",
      description: "Support will get back to you soon.",
    });
  };

  return (
    <ClientPageWrapper title="Ask support" subTitle="Send a message to Reglo support.">
      <div className="w-full pb-8 pt-2">
        <div className="max-w-3xl">
          <form
            onSubmit={handleSubmit}
            className="glass-panel rounded-3xl border border-white/40 p-6 shadow-sm"
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Your message
              </p>
              <Textarea
                placeholder="Describe your issue or request..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[200px] resize-none border-white/50 bg-white/80 shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50"
              />
            </div>
            <div className="mt-5 flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>We reply by email in 1-2 business days.</span>
              <Button type="submit" disabled={isSending} className="rounded-full px-5">
                {isSending ? "Sending..." : "Send message"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </ClientPageWrapper>
  );
}

export default SupportPage;
