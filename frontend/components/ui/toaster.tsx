"use client"

import { AlertCircle, CheckCircle2 } from "lucide-react"

import {
    Toast,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"

// The Toaster is mounted in the root layout, so it also renders on auth /
// marketing pages where the --voxly-* tokens don't exist. The fallbacks keep
// the icon colored there instead of silently dropping the declaration.
const SUCCESS_ICON = "text-[hsl(var(--voxly-success,145_63%_49%))]"
const ERROR_ICON = "text-[hsl(var(--voxly-heat,0_84%_60%))]"

export function Toaster() {
    const { toasts } = useToast()

    return (
        <ToastProvider>
            {toasts.map(function ({ id, title, description, action, variant, ...props }) {
                const Icon = variant === "destructive" ? AlertCircle : CheckCircle2
                return (
                    <Toast key={id} variant={variant} {...props}>
                        <div className="flex items-start gap-2.5 min-w-0">
                            <Icon
                                aria-hidden="true"
                                className={`mt-px h-[15px] w-[15px] flex-none ${variant === "destructive" ? ERROR_ICON : SUCCESS_ICON}`}
                            />
                            <div className="grid gap-0.5 min-w-0">
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
