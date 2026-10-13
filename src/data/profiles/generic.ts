import type { SeedProfile } from './profile'

// Generic logistics demo data (the original WareTrack look).

const SITES: SeedProfile['sites'] = [
  { id: 'site-osl', code: 'OSL', name: 'Alnabru terminal', city: 'Oslo', origin: { x: 0, z: 0 } },
  { id: 'site-bgo', code: 'BGO', name: 'Åsane lager', city: 'Bergen', origin: { x: 216, z: -8 } },
  { id: 'site-trd', code: 'TRD', name: 'Heimdal hub', city: 'Trondheim', origin: { x: 432, z: 6 } },
]

const CARRIERS = ['Nordlys Frakt', 'Fjordlast', 'Polar Logistikk', 'Vidde Transport']

const CATALOG: SeedProfile['catalog'] = [
  ['PAP-A4-500', 'Kopipapir A4, 500 ark', 'Kontor', 'eske'],
  ['PAP-A3-250', 'Kopipapir A3, 250 ark', 'Kontor', 'eske'],
  ['TON-HP-26X', 'Toner HP 26X', 'Kontor', 'stk'],
  ['KAF-BRY-1KG', 'Kaffe filtermalt 1 kg', 'Kantine', 'pose'],
  ['KAF-KAP-100', 'Kaffekapsler, 100 stk', 'Kantine', 'eske'],
  ['VAN-FL-05', 'Kildevann 0,5 l, 24-pk', 'Kantine', 'brett'],
  ['TOR-LUN-12', 'Tørkerull, 12-pk', 'Renhold', 'sekk'],
  ['SÅP-HÅND-5L', 'Håndsåpe 5 l', 'Renhold', 'kanne'],
  ['HAN-NIT-M', 'Nitrilhansker str. M', 'Verneutstyr', 'eske'],
  ['HAN-NIT-L', 'Nitrilhansker str. L', 'Verneutstyr', 'eske'],
  ['VES-REF-XL', 'Refleksvest XL', 'Verneutstyr', 'stk'],
  ['HJL-ABS-W', 'Vernehjelm hvit', 'Verneutstyr', 'stk'],
  ['STR-FLM-500', 'Strekkfilm 500 mm', 'Emballasje', 'rull'],
  ['TAP-BRN-50', 'Pakketape brun 50 mm', 'Emballasje', 'rull'],
  ['ESK-60-40', 'Bølgepappeske 60×40', 'Emballasje', 'bunt'],
  ['PAL-EUR-NY', 'EUR-pall ny', 'Emballasje', 'stk'],
  ['SKR-M8-50', 'Maskinskrue M8×50', 'Jernvare', 'eske'],
  ['MUT-M8', 'Mutter M8', 'Jernvare', 'eske'],
  ['BOL-M12-80', 'Bolt M12×80', 'Jernvare', 'eske'],
  ['KAB-CAT6-305', 'Nettverkskabel Cat6, 305 m', 'Elektro', 'rull'],
  ['LYS-LED-T8', 'LED-rør T8 120 cm', 'Elektro', 'stk'],
  ['BAT-AA-48', 'Batterier AA, 48-pk', 'Elektro', 'eske'],
  ['SKJ-STR-3', 'Skjøteledning 3 m', 'Elektro', 'stk'],
  ['OLJ-HYD-20', 'Hydraulikkolje 20 l', 'Verksted', 'kanne'],
  ['FET-UNI-400', 'Universalfett 400 g', 'Verksted', 'tube'],
  ['FIL-LUF-K2', 'Luftfilter K2', 'Verksted', 'stk'],
  ['DEK-195-65', 'Dekk 195/65 R15', 'Verksted', 'stk'],
  ['SPY-FRO-4L', 'Spylervæske 4 l', 'Verksted', 'kanne'],
  ['MAT-MEL-1KG', 'Hvetemel 1 kg', 'Dagligvare', 'sekk'],
  ['MAT-SUK-1KG', 'Sukker 1 kg', 'Dagligvare', 'sekk'],
  ['MAT-RIS-5KG', 'Ris 5 kg', 'Dagligvare', 'sekk'],
  ['MAT-HAV-1KG', 'Havregryn 1 kg', 'Dagligvare', 'pose'],
  ['MAT-PAS-500', 'Pasta 500 g', 'Dagligvare', 'kolli'],
  ['MAT-TOM-400', 'Hermetiske tomater 400 g', 'Dagligvare', 'brett'],
  ['MAT-OLJ-1L', 'Rapsolje 1 l', 'Dagligvare', 'kolli'],
  ['HAG-JOR-50', 'Plantejord 50 l', 'Hage', 'sekk'],
  ['HAG-GJØ-10', 'Gjødsel 10 kg', 'Hage', 'sekk'],
  ['HAG-SLA-25', 'Hageslange 25 m', 'Hage', 'stk'],
  ['MAL-HVI-10', 'Maling hvit 10 l', 'Bygg', 'spann'],
  ['SPA-INN-5L', 'Sparkel innendørs 5 l', 'Bygg', 'spann'],
]

export const genericProfile: SeedProfile = {
  sites: SITES,
  carriers: CARRIERS,
  catalog: CATALOG,
  forkliftName: 'Forklift',
  customers: [
    { name: 'Storsenteret', brand: 'stor', address: 'Senterveien 1' },
    { name: 'Matsenteret', brand: 'mat', address: 'Torget 4' },
    { name: 'Dagligvare', brand: 'dagligvare', address: 'Storgata 20' },
    { name: 'Nærbutikken', brand: 'naer', address: 'Hagegata 9' },
    { name: 'Kiosken', brand: 'kiosk', address: 'Stasjonsveien 2' },
    { name: 'Fersk', brand: 'fersk', address: 'Havnegata 15' },
  ],
  suppliers: ['Papirgrossisten', 'Kontorlevering AS', 'Byggvare Nord'],
  coldChain: false,
}
