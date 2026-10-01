import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    // Design Language "Inputs": bg, border-strong, 8px radius;
                    // primary border + soft 3px ring on focus, heat when invalid.
                    "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
