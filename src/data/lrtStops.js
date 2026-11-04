// LRT stops can't be picked on the map, so search sends each one to the MRT station its line
// joins. Stops reviewed against the Sengkang, Punggol and Bukit Panjang LRT lines in Nov 2026.
const sengkang = [
  'Compassvale',
  'Rumbia',
  'Bakau',
  'Kangkar',
  'Ranggung',
  'Cheng Lim',
  'Farmway',
  'Kupang',
  'Thanggam',
  'Fernvale',
  'Layar',
  'Tongkang',
  'Renjong',
]
const punggol = [
  'Cove',
  'Meridian',
  'Coral Edge',
  'Riviera',
  'Kadaloor',
  'Oasis',
  'Damai',
  'Sam Kee',
  'Teck Lee',
  'Punggol Point',
  'Samudera',
  'Nibong',
  'Sumang',
  'Soo Teck',
]
// The first three Bukit Panjang LRT stops are nearer Choa Chu Kang MRT than Bukit Panjang MRT
const choaChuKang = ['South View', 'Keat Hong', 'Teck Whye']
const bukitPanjang = [
  'Phoenix',
  'Petir',
  'Pending',
  'Bangkit',
  'Fajar',
  'Segar',
  'Jelapang',
  'Senja',
]

export const lrtStops = [
  ...sengkang.map((name) => ({ name, stationId: 'sengkang' })),
  ...punggol.map((name) => ({ name, stationId: 'punggol' })),
  ...choaChuKang.map((name) => ({ name, stationId: 'choa-chu-kang' })),
  ...bukitPanjang.map((name) => ({ name, stationId: 'bukit-panjang' })),
]
