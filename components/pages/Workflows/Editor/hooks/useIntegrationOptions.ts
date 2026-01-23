import { useEffect, useState } from "react";

import type {
  EmailSenderOption,
  FicClientOption,
  FicPaymentMethodOption,
  FicVatTypeOption,
  SlackChannelOption,
} from "@/components/pages/Workflows/Editor/types";

export const useIntegrationOptions = ({
  isSlackConnected,
  isFicConnected,
}: {
  isSlackConnected: boolean;
  isFicConnected: boolean;
}) => {
  const [slackChannelOptions, setSlackChannelOptions] = useState<SlackChannelOption[]>([]);
  const [slackChannelLoading, setSlackChannelLoading] = useState(false);
  const [slackChannelError, setSlackChannelError] = useState<string | null>(null);
  const [ficClientOptions, setFicClientOptions] = useState<FicClientOption[]>([]);
  const [ficClientLoading, setFicClientLoading] = useState(false);
  const [ficClientError, setFicClientError] = useState<string | null>(null);
  const [ficVatTypeOptions, setFicVatTypeOptions] = useState<FicVatTypeOption[]>([]);
  const [ficVatTypeLoading, setFicVatTypeLoading] = useState(false);
  const [ficVatTypeError, setFicVatTypeError] = useState<string | null>(null);
  const [ficPaymentMethodOptions, setFicPaymentMethodOptions] = useState<FicPaymentMethodOption[]>([]);
  const [ficPaymentMethodLoading, setFicPaymentMethodLoading] = useState(false);
  const [ficPaymentMethodError, setFicPaymentMethodError] = useState<string | null>(null);
  const [emailSenderOptions, setEmailSenderOptions] = useState<EmailSenderOption[]>([]);
  const [emailSenderLoading, setEmailSenderLoading] = useState(false);
  const [emailSenderError, setEmailSenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSlackConnected) {
      setSlackChannelOptions([]);
      setSlackChannelLoading(false);
      setSlackChannelError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setSlackChannelLoading(true);
    setSlackChannelError(null);

    fetch("/api/integrations/slack/channels", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          data?: SlackChannelOption[];
          message?: string;
          error?: string;
        };
        if (!active) return [];
        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? payload.error ?? "Impossibile caricare i canali Slack.");
        }
        return payload.data ?? [];
      })
      .then((data) => {
        if (!active) return;
        setSlackChannelOptions(data);
      })
      .catch((error) => {
        if (!active) return;
        const err = error as Error;
        if (err.name === "AbortError") return;
        setSlackChannelOptions([]);
        setSlackChannelError(err.message ?? "Impossibile caricare i canali Slack.");
      })
      .finally(() => {
        if (!active) return;
        setSlackChannelLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isSlackConnected]);

  useEffect(() => {
    if (!isFicConnected) {
      setFicClientOptions([]);
      setFicClientLoading(false);
      setFicClientError(null);
      setFicVatTypeOptions([]);
      setFicVatTypeLoading(false);
      setFicVatTypeError(null);
      setFicPaymentMethodOptions([]);
      setFicPaymentMethodLoading(false);
      setFicPaymentMethodError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setFicClientLoading(true);
    setFicClientError(null);
    setFicVatTypeLoading(true);
    setFicVatTypeError(null);
    setFicPaymentMethodLoading(true);
    setFicPaymentMethodError(null);

    fetch("/api/integrations/fatture-in-cloud/clients", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          data?: FicClientOption[];
          message?: string;
        };
        if (!active) return [];
        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Impossibile caricare i clienti FIC.");
        }
        return payload.data ?? [];
      })
      .then((data) => {
        if (!active) return;
        setFicClientOptions(data);
      })
      .catch((error) => {
        if (!active) return;
        const err = error as Error;
        if (err.name === "AbortError") return;
        setFicClientOptions([]);
        setFicClientError(err.message ?? "Impossibile caricare i clienti FIC.");
      })
      .finally(() => {
        if (!active) return;
        setFicClientLoading(false);
      });

    fetch("/api/integrations/fatture-in-cloud/vat-types", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          data?: FicVatTypeOption[];
          message?: string;
        };
        if (!active) return [];
        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Impossibile caricare le aliquote FIC.");
        }
        return payload.data ?? [];
      })
      .then((data) => {
        if (!active) return;
        setFicVatTypeOptions(data);
      })
      .catch((error) => {
        if (!active) return;
        const err = error as Error;
        if (err.name === "AbortError") return;
        setFicVatTypeOptions([]);
        setFicVatTypeError(err.message ?? "Impossibile caricare le aliquote FIC.");
      })
      .finally(() => {
        if (!active) return;
        setFicVatTypeLoading(false);
      });

    fetch("/api/integrations/fatture-in-cloud/payment-methods", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          data?: FicPaymentMethodOption[];
          message?: string;
        };
        if (!active) return [];
        if (!response.ok || !payload.success) {
          throw new Error(
            payload.message ?? "Impossibile caricare i metodi di pagamento FIC.",
          );
        }
        return payload.data ?? [];
      })
      .then((data) => {
        if (!active) return;
        setFicPaymentMethodOptions(data);
      })
      .catch((error) => {
        if (!active) return;
        const err = error as Error;
        if (err.name === "AbortError") return;
        setFicPaymentMethodOptions([]);
        setFicPaymentMethodError(
          err.message ?? "Impossibile caricare i metodi di pagamento FIC.",
        );
      })
      .finally(() => {
        if (!active) return;
        setFicPaymentMethodLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isFicConnected]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setEmailSenderLoading(true);
    setEmailSenderError(null);

    fetch("/api/email/senders", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          data?: EmailSenderOption[];
          message?: string;
        };
        if (!active) return [];
        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Impossibile caricare i mittenti email.");
        }
        return payload.data ?? [];
      })
      .then((data) => {
        if (!active) return;
        setEmailSenderOptions(data);
      })
      .catch((error) => {
        if (!active) return;
        const err = error as Error;
        if (err.name === "AbortError") return;
        setEmailSenderOptions([]);
        setEmailSenderError(err.message ?? "Impossibile caricare i mittenti email.");
      })
      .finally(() => {
        if (!active) return;
        setEmailSenderLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return {
    slackChannelOptions,
    slackChannelLoading,
    slackChannelError,
    ficClientOptions,
    ficClientLoading,
    ficClientError,
    ficVatTypeOptions,
    ficVatTypeLoading,
    ficVatTypeError,
    ficPaymentMethodOptions,
    ficPaymentMethodLoading,
    ficPaymentMethodError,
    emailSenderOptions,
    emailSenderLoading,
    emailSenderError,
  };
};
