import * as React from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type = 'text', onWheel, ...props }, ref) => {
    // Browsers change a focused <input type="number">'s value on mousewheel
    // scroll, which is surprising mid-page-scroll and can drift the value
    // into ugly floats with step="0.01". Blur on wheel so scrolling just
    // scrolls the page instead.
    const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
      if (type === 'number') {
        event.currentTarget.blur()
      }
      onWheel?.(event)
    }

    return (
      <div className="w-full">
        {label && (
          <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">
            {label}
          </label>
        )}
        <input
          type={type}
          ref={ref}
          onWheel={handleWheel}
          className={cn(
            'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
            'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
