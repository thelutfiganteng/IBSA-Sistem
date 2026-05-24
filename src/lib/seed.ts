import type { Commodity, Market, Region } from "./types";

export const COMMODITIES: Commodity[] = [
  { id: "beras", name: "Beras", unit: "kg", icon: "🌾", basePrice: 14000, limitType: "HET", limitPrice: 14900 },
  { id: "bawang-merah", name: "Bawang Merah", unit: "kg", icon: "🧅", basePrice: 38000, limitType: "HAP", limitPrice: 41500 },
  { id: "bawang-putih", name: "Bawang Putih", unit: "kg", icon: "🧄", basePrice: 42000, limitType: "HAP", limitPrice: 45000 },
  { id: "cabai", name: "Cabai Merah", unit: "kg", icon: "🌶️", basePrice: 55000, limitType: "HAP", limitPrice: 57000 },
];

// Pasar induk Sumsel
export const MARKETS: Market[] = [
  { id: "jakabaring", name: "Pasar Induk Jakabaring", region: "palembang", lat: -3.014, lng: 104.776 },
  { id: "km5", name: "Pasar KM 5", region: "palembang", lat: -2.978, lng: 104.748 },
  { id: "lemabang", name: "Pasar Lemabang", region: "palembang", lat: -2.969, lng: 104.79 },
  { id: "lubuklinggau", name: "Pasar Lubuklinggau", region: "lubuklinggau", lat: -3.296, lng: 102.86 },
  { id: "prabumulih", name: "Pasar Prabumulih", region: "prabumulih", lat: -3.443, lng: 104.236 },
  { id: "muara-enim", name: "Pasar Muara Enim", region: "muara-enim", lat: -3.654, lng: 103.797 },
];

// Kabupaten/Kota Sumsel (subset utama dengan standarisasi Satu Data Indonesia)
export const REGIONS: Region[] = [
  { id: "palembang", name: "Kota Palembang", lat: -2.9909, lng: 104.7566, population: 1700000, kemendagriCode: "16.71.00.0000", bpsCode: "1671" },
  { id: "lubuklinggau", name: "Kota Lubuklinggau", lat: -3.296, lng: 102.86, population: 230000, kemendagriCode: "16.73.00.0000", bpsCode: "1674" },
  { id: "prabumulih", name: "Kota Prabumulih", lat: -3.443, lng: 104.236, population: 200000, kemendagriCode: "16.74.00.0000", bpsCode: "1672" },
  { id: "pagaralam", name: "Kota Pagar Alam", lat: -4.022, lng: 103.252, population: 145000, kemendagriCode: "16.72.00.0000", bpsCode: "1673" },
  { id: "muara-enim", name: "Kab. Muara Enim", lat: -3.654, lng: 103.797, population: 620000, kemendagriCode: "16.03.00.0000", bpsCode: "1603" },
  { id: "oku", name: "Kab. Ogan Komering Ulu", lat: -4.142, lng: 104.0, population: 370000, kemendagriCode: "16.01.00.0000", bpsCode: "1601" },
  { id: "oki", name: "Kab. Ogan Komering Ilir", lat: -3.36, lng: 105.06, population: 780000, kemendagriCode: "16.02.00.0000", bpsCode: "1602" },
  { id: "musi-banyuasin", name: "Kab. Musi Banyuasin", lat: -2.5, lng: 103.85, population: 640000, kemendagriCode: "16.06.00.0000", bpsCode: "1607" },
  { id: "banyuasin", name: "Kab. Banyuasin", lat: -2.866, lng: 104.388, population: 830000, kemendagriCode: "16.07.00.0000", bpsCode: "1608" },
  { id: "lahat", name: "Kab. Lahat", lat: -3.78, lng: 103.55, population: 410000, kemendagriCode: "16.04.00.0000", bpsCode: "1604" },
  { id: "musi-rawas", name: "Kab. Musi Rawas", lat: -3.05, lng: 102.95, population: 400000, kemendagriCode: "16.05.00.0000", bpsCode: "1605" },
  { id: "empat-lawang", name: "Kab. Empat Lawang", lat: -3.78, lng: 103.0, population: 250000, kemendagriCode: "16.11.00.0000", bpsCode: "1611" },
  { id: "pali", name: "Kab. PALI", lat: -3.25, lng: 103.95, population: 200000, kemendagriCode: "16.12.00.0000", bpsCode: "1612" },
  { id: "oku-selatan", name: "Kab. OKU Selatan", lat: -4.55, lng: 103.85, population: 360000, kemendagriCode: "16.08.00.0000", bpsCode: "1606" },
  { id: "oku-timur", name: "Kab. OKU Timur", lat: -4.13, lng: 104.65, population: 660000, kemendagriCode: "16.09.00.0000", bpsCode: "1609" },
];

export const DEMO_USERS = [
  { email: "bi@demo.id", password: "demo", name: "Andi (BI)", role: "bi" as const },
  { email: "bps@demo.id", password: "demo", name: "Rina (BPS)", role: "bps" as const },
  { email: "pemprov@demo.id", password: "demo", name: "Budi (Pemprov)", role: "pemprov" as const },
  { email: "dinas@demo.id", password: "demo", name: "Sari (Dinas Pangan)", role: "dinas" as const },
  { email: "pasar@demo.id", password: "demo", name: "Joko (Pasar Induk)", role: "pasar" as const },
];

export const ROLE_LABEL: Record<string, string> = {
  bi: "Bank Indonesia",
  bps: "BPS",
  pemprov: "Pemprov Sumsel",
  dinas: "Dinas Pangan",
  pasar: "Pasar Induk",
};
