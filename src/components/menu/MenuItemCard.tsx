'use client'

/* eslint-disable @next/next/no-img-element */

import { MenuItem } from '@/types'
import { formatCurrency } from '@/utils/format'

interface MenuItemCardProps {
  item: MenuItem
  quantity: number
  currency?: string
  onAdd: () => void
  onRemove: () => void
  variant?: 'list' | 'grid'
}

export function MenuItemCard({ item, quantity, currency, onAdd, onRemove, variant = 'list' }: MenuItemCardProps) {
  const isAvailable = item.available
  const hasModifiers = Boolean(item.modifier_groups?.length)

if (variant === "grid") {
  return (
    <div
      className={
        isAvailable
          ? "group flex overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          : "flex overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 p-2 opacity-75 shadow-sm"
      }
    >
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-32 sm:w-32">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <svg
              className="h-9 w-9"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {!isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between px-3 py-2">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-base font-bold leading-snug text-gray-950">
              {item.name}
            </h3>

            {!isAvailable && (
              <span className="hidden shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 sm:inline-flex">
                Unavailable
              </span>
            )}
          </div>

          {item.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
              {item.description}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-700">
              {formatCurrency(item.price, currency)}
            </p>
            {hasModifiers && isAvailable && (
              <p className="mt-0.5 text-[11px] font-medium text-gray-400">
                Customizable
              </p>
            )}
          </div>

          {!isAvailable ? (
            <button
              disabled
              className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full bg-gray-200 text-gray-400"
              aria-label="Unavailable"
            >
              +
            </button>
          ) : quantity > 0 ? (
            <div className="flex items-center gap-2 rounded-full bg-gray-100 px-1.5 py-1">
              <button
                onClick={onRemove}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm active:bg-gray-100"
                aria-label={`Remove ${item.name}`}
              >
                −
              </button>

              <span className="min-w-[1.25rem] text-center text-sm font-bold text-gray-900">
                {quantity}
              </span>

              <button
                onClick={onAdd}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm active:bg-brand-700"
                aria-label={`Add ${item.name}`}
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold leading-none text-white shadow-lg shadow-brand-600/25 transition active:bg-brand-700"
              aria-label={
                hasModifiers ? `Customize ${item.name}` : `Add ${item.name}`
              }
            >
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

  return (
    <div
      className={
        isAvailable
          ? "group flex min-h-[210px] flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition active:scale-[0.99]"
          : "flex min-h-[210px] flex-col overflow-hidden rounded-xl border border-gray-100 bg-gray-50 opacity-75 shadow-sm"
      }
    >
      <div className="relative h-28 w-full overflow-hidden bg-gray-100 sm:h-32">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <svg
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {!isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-1 text-xs font-bold leading-snug text-gray-950 sm:text-sm">
          {" "}
          {item.name}
        </h3>

        {item.description && (
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-gray-500">
            {" "}
            {item.description}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-brand-700 sm:text-sm">
              {" "}
              {formatCurrency(item.price, currency)}
            </p>

            {hasModifiers && isAvailable && (
              <p className="mt-0.5 text-[10px] font-medium text-gray-400">
                Customizable
              </p>
            )}
          </div>

          {!isAvailable ? (
            <button
              disabled
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold leading-none text-white shadow-lg shadow-brand-600/25 active:bg-brand-700"
              aria-label="Unavailable"
            >
              +
            </button>
          ) : quantity > 0 ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-1 py-1">
              <button
                onClick={onRemove}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-gray-600 shadow-sm active:bg-gray-100"
                aria-label={`Remove ${item.name}`}
              >
                −
              </button>

              <span className="min-w-[1rem] text-center text-xs font-bold text-gray-900">
                {quantity}
              </span>

              <button
                onClick={onAdd}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm active:bg-brand-700"
                aria-label={`Add ${item.name}`}
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold leading-none text-white shadow-lg shadow-brand-600/25 active:bg-brand-700"
              aria-label={
                hasModifiers ? `Customize ${item.name}` : `Add ${item.name}`
              }
            >
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
}
