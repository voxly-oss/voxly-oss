import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

// A real <select> (keyboard, mobile pickers and forms all work for free)
// dressed like <Input>. appearance-none + our own chevron, because the
// browser's default arrow ignores the theme.
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <div className="relative">
                <select
                    ref={ref}
                    className={cn(
                        "flex h-10 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-9 text-[13px] text-foreground transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]",
                        className
                    )}
                    {...props}
                >
                    {children}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
        )
    }
)
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
