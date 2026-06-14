import type { MenuItem, Modifier } from '@/types'

export type ModifierSelections = Record<string, string[]>

export function updateModifierSelection(
  selections: ModifierSelections,
  groupId: string,
  modifierId: string,
  isMultiselect: boolean
): ModifierSelections {
  const groupSelections = selections[groupId] || []

  if (!isMultiselect) {
    return { ...selections, [groupId]: [modifierId] }
  }

  if (groupSelections.includes(modifierId)) {
    return { ...selections, [groupId]: groupSelections.filter((id) => id !== modifierId) }
  }

  return { ...selections, [groupId]: [...groupSelections, modifierId] }
}

export function isModifierSelectionValid(item: MenuItem | null, selections: ModifierSelections) {
  if (!item?.modifier_groups?.length) return true

  return item.modifier_groups.every((group) => {
    if (!group.is_required) return true
    return (selections[group.id] || []).length > 0
  })
}

export function getSelectedModifierRecords(item: MenuItem, selections: ModifierSelections): Modifier[] {
  const selectedModifiers: Modifier[] = []

  Object.values(selections).flat().forEach((modifierId) => {
    for (const group of item.modifier_groups || []) {
      const modifier = group.modifiers?.find((candidate) => candidate.id === modifierId)
      if (modifier) {
        selectedModifiers.push({
          ...modifier,
          group_is_required: group.is_required,
          group_is_multiselect: group.is_multiselect,
        })
      }
    }
  })

  return selectedModifiers
}
