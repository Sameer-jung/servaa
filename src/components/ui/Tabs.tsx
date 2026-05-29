'use client'

import * as React from 'react'
import { cn } from '@/utils/cn'

interface TabsProps {
  tabs: { id: string; label: string }[]
  activeTab: string
  onChange: (tabId: string) => void
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex space-x-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all',
            activeTab === tab.id
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-gray-100'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
