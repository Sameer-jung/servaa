import type { MenuItem, Modifier, ModifierGroup } from '@/types'

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

export interface VariantBadge {
  count: number
  label: string
}

// Labels the item card's customization badge based on the group that best
// represents it: a required single-choice group changes the base item
// ("Variants"), a required multi-choice group is a required pick-list
// ("Options"), and a purely optional group is an "Add-ons" upsell.
export function getVariantBadge(modifierGroups?: ModifierGroup[]): VariantBadge | null {
  if (!modifierGroups?.length) return null

  const requiredSingle = modifierGroups.find((group) => group.is_required && !group.is_multiselect)
  const requiredMulti = modifierGroups.find((group) => group.is_required && group.is_multiselect)
  const optional = modifierGroups.find((group) => !group.is_required)
  const primary = requiredSingle || requiredMulti || optional

  if (!primary?.modifiers?.length) return null

  const count = primary.modifiers.length
  const word = primary === requiredSingle ? 'Variant' : primary === requiredMulti ? 'Option' : 'Add-on'

  return { count, label: count === 1 ? word : `${word}s` }
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
