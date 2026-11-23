export type GameScreen = 'TITLE' | 'PLAYING' | 'PAUSED' | 'SUMMARY' | 'GARAGE';

export type RiderId = string;

export type MonsterArchetype =
  | 'ape_bigfoot'
  | 'winged_moth'
  | 'spectral_banshee'
  | 'skull_reaper'
  | 'horned_fiend'
  | 'serpent_nessie'
  | 'antler_wendigo'
  | 'canine_beast'
  | 'avian_winged'
  | 'frog_kappa'
  | 'alien_hood'
  | 'headless_knight'
  | 'nightcrawler'
  | 'fox_kitsune'
  | 'cyclops_brute'
  | 'rabbit_jackalope'
  | 'catrina_hat'
  | 'witch_crone'
  | 'goblin_imp'
  | 'jackal_anubis'
  | 'equine_kelpie'
  | 'catfish_namazu'
  | 'blemmyes_torso';

export type BikeId =
  | 'rusty_cruiser'
  | 'scrap_chopper'
  | 'midnight_sport'
  | 'hellhound_trike'
  | 'phantom_dragster';

export type PartSlot = 'exhaust' | 'wheels' | 'headlight' | 'nitro';

export type ScareMechanicId =
  | 'thunder_rev'
  | 'highbeam_loom'
  | 'prop_havoc'
  | 'banshee_wail'
  | 'hellfire_scorch';

export type ScareCategory =
  | 'Auditory'
  | 'Visual'
  | 'Environmental'
  | 'Psychic'
  | 'Elemental';

export type CosmeticId =
  | 'spiked_cut'
  | 'skull_sissy_bar'
  | 'shadow_cape'
  | 'bull_horns'
  | 'cursed_eyeballs'
  | 'out_of_lines_aura';

export type VehicleControlMode =
  | 'own_bike'
  | 'stolen_sedan'
  | 'stolen_muscle'
  | 'stolen_van'
  | 'stolen_bike'
  | 'on_foot';

export interface ArtCrop {
  sheet: string;
  sheetW: number;
  sheetH: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RiderDef {
  id: RiderId;
  poolNumber: string;
  collection: 'free' | 'pool1' | 'pool2';
  name: string;
  epithet: string;
  origin: string;
  backstory: string;
  cost: number;
  archetype: MonsterArchetype;
  signatureName: string;
  signatureDesc: string;
  signatureCooldown: number;
  signatureColor: string;
  passiveName: string;
  passiveDesc: string;
  accentColor: string;
  bodyColor: string;
  secondaryColor: string;
  eyeColor: string;
  art: ArtCrop;
  bonuses: {
    speedMult?: number;
    darkSpeedBonus?: number;
    scareRadiusMult?: number;
    scareCooldownMult?: number;
    scarePowerBonus?: number;
    dreadMult?: number;
    propDreadMult?: number;
    footArmorMult?: number;
    immuneToFlash?: boolean;
    nitroDurationMult?: number;
    comboTimeBonus?: number;
    maxHpBonus?: number;
  };
}

export interface BikeDef {
  id: BikeId;
  name: string;
  style: string;
  description: string;
  cost: number;
  topSpeed: number;
  turnRate: number;
  maxHp: number;
  armorScale: number;
  frameColor: string;
  tankColor: string;
  isTrike?: boolean;
  isChopper?: boolean;
  isSport?: boolean;
  isDragster?: boolean;
}

export interface PartDef {
  id: string;
  slot: PartSlot;
  name: string;
  description: string;
  cost: number;
  tier: number;
  stats: {
    speedBonus?: number;
    turnBonus?: number;
    scareRadiusBonus?: number;
    scarePowerBonus?: number;
    nitroDurationBonus?: number;
    nitroSpeedBonus?: number;
    dreadMultBonus?: number;
  };
}

export interface ScareMechanicDef {
  id: ScareMechanicId;
  hotkey: string;
  name: string;
  category: ScareCategory;
  complexity: 'Basic' | 'Tactical' | 'Advanced';
  description: string;
  mountedEffect: string;
  onFootEffect: string;
  unlockCost: number;
  upgradeCosts: [number, number];
  baseRadius: number;
  radiusPerLevel: number;
  basePower: number;
  panicDamage: number;
  cooldown: number;
  dreadMultiplier: number;
  color: string;
  shoutWords: string[];
  triggersProps?: boolean;
  coneAngle?: number;
}

export interface CosmeticDef {
  id: CosmeticId;
  name: string;
  description: string;
  cost: number;
  dreadBonusPct: number;
  accentColor: string;
}

export interface EquippedLoadout {
  rider: RiderId;
  bike: BikeId;
  parts: Record<PartSlot, string>;
  activeScare: ScareMechanicId;
  cosmetics: CosmeticId[];
}

export interface PlayerSave {
  dread: number;
  totalDreadEarned: number;
  totalWrecked: number;
  totalHijacked: number;
  bestRunDread: number;
  bestCombo: number;
  runsCompleted: number;
  unlockedRiders: RiderId[];
  rescuedRiders: RiderId[];
  unlockedBikes: BikeId[];
  unlockedParts: string[];
  scareLevels: Record<ScareMechanicId, number>;
  unlockedCosmetics: CosmeticId[];
  equipped: EquippedLoadout;
}

export interface ComputedStats {
  topSpeed: number;
  mphMax: number;
  turnRate: number;
  maxHp: number;
  scareRadiusBonus: number;
  scareRadiusMult: number;
  scarePowerBonus: number;
  scareCooldownMult: number;
  dreadMultiplier: number;
  propDreadMultiplier: number;
  nitroDuration: number;
  nitroSpeedBonus: number;
  comboWindow: number;
  footDamageMult: number;
  immuneToFlash: boolean;
  darkSpeedBonus: number;
}

export interface ScareSlotState {
  id: ScareMechanicId;
  hotkey: string;
  name: string;
  category: ScareCategory;
  level: number;
  readyFrac: number;
  color: string;
  selected: boolean;
}

export interface FloatingCallout {
  id: number;
  text: string;
  subtext?: string;
  color: string;
  xPct: number;
  yPct: number;
  age: number;
}

export interface CaptiveHudInfo {
  riderId: RiderId;
  riderName: string;
  poolNumber: string;
  hpFrac: number; // 0..1
  distanceAhead: number; // meters (+ ahead, - behind)
  canLeapToBreak: boolean;
}

export interface HudSnapshot {
  dreadThisRun: number;
  bankDread: number;
  wreckedCount: number;
  hijackedCount: number;
  propsTriggered: number;
  distanceMiles: number;
  combo: number;
  bestCombo: number;
  comboTimerFrac: number;
  hp: number;
  maxHp: number;
  mph: number;
  nitroFrac: number;
  nitroActive: boolean;
  controlMode: VehicleControlMode;
  vehicleLabel: string;
  hijackTargetLabel: string | null;
  inDarkness: boolean;
  inSpotlightWarning: boolean;
  captiveTruck: CaptiveHudInfo | null;
  rescuedThisRun: RiderId[];
  signatureName: string;
  signatureReadyFrac: number;
  signatureColor: string;
  scareSlots: ScareSlotState[];
  statusToast: string | null;
  callouts: FloatingCallout[];
}

export interface RunSummaryData {
  dreadEarned: number;
  wreckedCount: number;
  hijackedCount: number;
  propsTriggered: number;
  rescuedRiders: RiderId[];
  bestCombo: number;
  maxMph: number;
  distanceMiles: number;
  endedByDefeat: boolean;
  isNewRecord: boolean;
}
