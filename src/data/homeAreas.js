export const areaGroups = [
  {
    name: 'Central',
    areas: [
      'Bishan',
      'Bugis',
      'Bukit Merah',
      'Bukit Timah',
      'City / Downtown',
      'Geylang',
      'Kallang',
      'Marine Parade',
      'Novena',
      'Orchard',
      'Queenstown',
      'Tanjong Pagar',
      'Toa Payoh',
    ],
  },
  { name: 'East', areas: ['Bedok', 'Changi', 'Pasir Ris', 'Paya Lebar', 'Tampines'] },
  { name: 'North', areas: ['Sembawang', 'Woodlands', 'Yishun'] },
  { name: 'North-East', areas: ['Ang Mo Kio', 'Hougang', 'Punggol', 'Sengkang', 'Serangoon'] },
  {
    name: 'West',
    areas: [
      'Bukit Batok',
      'Bukit Panjang',
      'Choa Chu Kang',
      'Clementi',
      'Jurong East',
      'Jurong West',
    ],
  },
]

export const homeAreas = areaGroups.flatMap((group) => group.areas).sort()
