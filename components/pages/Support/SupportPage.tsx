"use client";

import React from "react";
import ClientPageWrapper from "@/components/Layout/ClientPageWrapper";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/components/ui/feedback-toast";

export function SupportPage(): React.ReactElement {
  const [message, setMessage] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const toast = useFeedbackToast();

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
        <div className="max-w-2xl">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border bg-card p-4 shadow-sm"
          >
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Your message
              </p>
              <Textarea
                placeholder="Describe your issue or request..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[180px] resize-none"
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>We reply by email in 1-2 business days.</span>
              <Button type="submit" disabled={isSending}>
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
