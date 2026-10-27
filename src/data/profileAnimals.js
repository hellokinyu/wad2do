export const profileAnimals = [
  { id: 'dog', label: 'Dog', background: '#f8e7cf' },
  { id: 'cat', label: 'Cat', background: '#fce1e7' },
  { id: 'duck', label: 'Duck', background: '#fff1bf' },
  { id: 'goldfish', label: 'Goldfish', background: '#dff2f5' },
  { id: 'panda', label: 'Panda', background: '#e6eedf' },
]

export function findProfileAnimal(id) {
  return profileAnimals.find((animal) => animal.id === id) ?? null
}

export function hasProfileIdentity(metadata) {
  return (
    typeof metadata?.display_name === 'string' &&
    metadata.display_name.trim().length > 0 &&
    metadata.display_name.trim().length <= 40 &&
    !!findProfileAnimal(metadata?.avatar_animal)
  )
}
