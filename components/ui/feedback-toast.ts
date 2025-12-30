"use client";

import { useToast } from "@/hooks/use-toast";

type ToastPayload = {
  title?: string;
  description?: string;
};

export function useFeedbackToast() {
  const { toast } = useToast();

  return {
    success: (payload: ToastPayload) =>
      toast({
        title: payload.title ?? "Operazione completata",
        description: payload.description,
      }),
    info: (payload: ToastPayload) =>
      toast({
        title: payload.title ?? "Informazione",
        description: payload.description,
      }),
    error: (payload: ToastPayload) =>
      toast({
        variant: "destructive",
        title: payload.title ?? "Errore",
        description: payload.description,
      }),
  };
}
