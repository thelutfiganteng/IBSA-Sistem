export type Role = "bi" | "bps" | "pemprov" | "dinas" | "pasar";

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
}

export interface Commodity {
  id: string;
  name: string;
  unit: string;
  icon: string;
  basePrice: number;
  limitType: "HAP" | "HET"; // HAP (Harga Acuan Penjualan) / HET (Harga Eceran Tertinggi)
  limitPrice: number; // Regulatory ceiling price from central government
}

export interface Market {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
}

export interface Region {
  id: string;
  name: string;
  lat: number;
  lng: number;
  population: number;
  kemendagriCode: string; // 10-digit official Kemendagri Code for Satu Data Indonesia
  bpsCode: string; // Official BPS Code
}

export interface WeighRecord {
  id: string;
  tanggal: string; // ISO
  komoditasId: string;
  berat: number; // kg
  harga: number; // per kg
  pasarId: string;
  petugas: string;
  foto: string;
  lokasi: string;
  status_supply: "incoming" | "stored" | "distributed";
  aiLabel?: string;
}

export interface RegionMetric {
  regionId: string;
  totalSupply: number;
  totalDemand: number;
  avgPrice: number;
  distributionVolume: number;
  supplyFrequency: number;
  warehouseStock: number;
  activeMarkets: number;
  surplusDeficit: number; // supply - demand
  cluster?: ClusterLabel;
  inflationRisk?: "Low" | "Medium" | "High";
}

export type ClusterLabel =
  | "Surplus Tinggi"
  | "Surplus Sedang"
  | "Stabil"
  | "Defisit Sedang"
  | "Defisit Tinggi"
  | "Krisis Pangan";

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  role: Role;
  action: string;
  detail?: string;
}

export interface DistributionRecommendation {
  id: string;
  fromRegionId: string;
  toRegionId: string;
  komoditasId: string;
  amountKg: number;
  priority: "low" | "medium" | "high";
  reason: string;
}
