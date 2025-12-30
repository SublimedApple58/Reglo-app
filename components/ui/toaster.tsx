"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, AlertTriangle } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const Icon =
          props.variant === "destructive" ? AlertTriangle : CheckCircle2
        const iconColor =
          props.variant === "destructive"
            ? "text-rose-500"
            : "text-emerald-500"
        return (
          <Toast key={id} {...props}>
            <div className="flex gap-3">
              <Icon className={`mt-0.5 h-4 w-4 ${iconColor}`} />
              <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
