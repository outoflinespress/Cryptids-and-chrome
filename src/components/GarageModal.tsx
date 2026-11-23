import { useMemo, useState } from 'react';
import {
  Bike,
  Check,
  Flame,
  Lock,
  Play,
  Search,
  Sparkles,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import {
  BIKES,
  computeLoadoutStats,
  COSMETICS,
  getRider,
  PARTS,
  RIDERS,
  SCARE_MECHANICS,
} from '../game/catalog';
import {
  BikeId,
  CosmeticId,
  PartSlot,
  PlayerSave,
  RiderId,
  ScareMechanicId,
} from '../game/types';
import { MonsterArtwork } from './MonsterArtwork';

type GarageTab = 'riders' | 'bikes' | 'parts' | 'scares' | 'cosmetics';
type RiderFilter = 'all' | 'unlocked' | 'free' | 'pool1' | 'pool2';

interface GarageModalProps {
  save: PlayerSave;
  onUpdateSave: (updater: (prev: PlayerSave) => PlayerSave) => void;
  onClose: () => void;
  onPlayNow: () => void;
}

const PART_SLOT_LABELS: Record<PartSlot, string> = {
  exhaust: 'Exhaust Pipes',
  wheels: 'Wheels & Tires',
  headlight: 'Headlights',
  nitro: 'Nitro Core',
};

export function GarageModal({
  save,
  onUpdateSave,
  onClose,
  onPlayNow,
}: GarageModalProps) {
  const [tab, setTab] = useState<GarageTab>('riders');
  const [riderFilter, setRiderFilter] = useState<RiderFilter>('all');
  const [search, setSearch] = useState('');
  const [inspectedRiderId, setInspectedRiderId] = useState<RiderId>(
    save.equipped.rider,
  );

  const stats = useMemo(
    () => computeLoadoutStats(save.equipped),
    [save.equipped],
  );

  const inspectedRider = useMemo(
    () => getRider(inspectedRiderId),
    [inspectedRiderId],
  );

  const filteredRiders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return RIDERS.filter((r) => {
      if (riderFilter === 'unlocked' && !save.unlockedRiders.includes(r.id)) {
        return false;
      }
      if (riderFilter === 'free' && r.collection !== 'free') return false;
      if (riderFilter === 'pool1' && r.collection !== 'pool1') return false;
      if (riderFilter === 'pool2' && r.collection !== 'pool2') return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.origin.toLowerCase().includes(q) ||
        r.poolNumber.toLowerCase().includes(q) ||
        r.signatureName.toLowerCase().includes(q)
      );
    });
  }, [riderFilter, search, save.unlockedRiders]);

  const handleEquipRider = (id: RiderId) => {
    if (!save.unlockedRiders.includes(id)) return;
    soundEngine.playGarageClick();
    onUpdateSave((prev) => ({
      ...prev,
      equipped: { ...prev.equipped, rider: id },
    }));
  };

  const handleBuyRider = (id: RiderId, cost: number) => {
    if (save.unlockedRiders.includes(id) || save.dread < cost) return;
    soundEngine.playGarageClick();
    onUpdateSave((prev) => ({
      ...prev,
      dread: prev.dread - cost,
      unlockedRiders: [...prev.unlockedRiders, id],
      equipped: { ...prev.equipped, rider: id },
    }));
  };

  const handleBuyOrEquipBike = (id: BikeId, cost: number) => {
    const owned = save.unlockedBikes.includes(id);
    if (owned) {
      soundEngine.playGarageClick();
      onUpdateSave((prev) => ({
        ...prev,
        equipped: { ...prev.equipped, bike: id },
      }));
      return;
    }
    if (save.dread < cost) return;
    soundEngine.playGarageClick();
    onUpdateSave((prev) => ({
      ...prev,
      dread: prev.dread - cost,
      unlockedBikes: [...prev.unlockedBikes, id],
      equipped: { ...prev.equipped, bike: id },
    }));
  };

  const handleBuyOrEquipPart = (partId: string, slot: PartSlot, cost: number) => {
    const owned = save.unlockedParts.includes(partId);
    if (owned) {
      soundEngine.playGarageClick();
      onUpdateSave((prev) => ({
        ...prev,
        equipped: {
          ...prev.equipped,
          parts: { ...prev.equipped.parts, [slot]: partId },
        },
      }));
      return;
    }
    if (save.dread < cost) return;
    soundEngine.playGarageClick();
    onUpdateSave((prev) => ({
      ...prev,
      dread: prev.dread - cost,
      unlockedParts: [...prev.unlockedParts, partId],
      equipped: {
        ...prev.equipped,
        parts: { ...prev.equipped.parts, [slot]: partId },
      },
    }));
  };

  const handleUpgradeScare = (id: ScareMechanicId) => {
    const def = SCARE_MECHANICS.find((m) => m.id === id);
    if (!def) return;
    const currentLv = save.scareLevels[id] ?? 0;
    if (currentLv >= 3) return;
    const cost =
      currentLv === 0 ? def.unlockCost : def.upgradeCosts[currentLv - 1];
    if (save.dread < cost) return;
    soundEngine.playGarageClick();
    onUpdateSave((prev) => ({
      ...prev,
      dread: prev.dread - cost,
      scareLevels: { ...prev.scareLevels, [id]: currentLv + 1 },
      equipped: { ...prev.equipped, activeScare: id },
    }));
  };

  const handleSelectActiveScare = (id: ScareMechanicId) => {
    if ((save.scareLevels[id] ?? 0) <= 0) return;
    soundEngine.playGarageClick();
    onUpdateSave((prev) => ({
      ...prev,
      equipped: { ...prev.equipped, activeScare: id },
    }));
  };

  const handleBuyOrToggleCosmetic = (id: CosmeticId, cost: number) => {
    const owned = save.unlockedCosmetics.includes(id);
    if (owned) {
      soundEngine.playGarageClick();
      onUpdateSave((prev) => {
        const has = prev.equipped.cosmetics.includes(id);
        return {
          ...prev,
          equipped: {
            ...prev.equipped,
            cosmetics: has
              ? prev.equipped.cosmetics.filter((c) => c !== id)
              : [...prev.equipped.cosmetics, id],
          },
        };
      });
      return;
    }
    if (save.dread < cost) return;
    soundEngine.playGarageClick();
    onUpdateSave((prev) => ({
      ...prev,
      dread: prev.dread - cost,
      unlockedCosmetics: [...prev.unlockedCosmetics, id],
      equipped: {
        ...prev.equipped,
        cosmetics: [...prev.equipped.cosmetics, id],
      },
    }));
  };

  const inspectedUnlocked = save.unlockedRiders.includes(inspectedRider.id);
  const inspectedRescued = save.rescuedRiders.includes(inspectedRider.id);
  const inspectedEquipped = save.equipped.rider === inspectedRider.id;

  return (
    <div className="fixed inset-0 z-20 flex justify-end pointer-events-none">
      {/* Left-side live rider preview label (keeps left side open to admire the selected rider & bike) */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-6 pointer-events-none">
        <div>
          <div className="font-mono text-xs tracking-widest uppercase text-[#ff7a29]">
            Live Rider Showcase
          </div>
          <h2 className="font-display text-4xl font-extrabold tracking-wide uppercase text-[#f4efe6] mt-0.5 drop-shadow-[0_3px_0_rgba(0,0,0,0.85)]">
            {getRider(save.equipped.rider).name}
          </h2>
          <p className="text-sm text-[#c9d0dc] max-w-xs mt-0.5">
            {getRider(save.equipped.rider).epithet} ·{' '}
            {BIKES.find((b) => b.id === save.equipped.bike)?.name}
          </p>
        </div>

        <div className="bg-[#0e111a]/90 border-2 border-[#2a3142] p-3.5 max-w-xs">
          <div className="text-xs font-mono uppercase text-[#9aa3b2] mb-1.5">
            Highway Rescue Progress
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold text-[#8cff2e] tabular-nums">
              {save.unlockedRiders.length} / {RIDERS.length}
            </span>
            <span className="text-xs font-mono text-[#c9d0dc]">
              {RIDERS.length - save.unlockedRiders.length} still in Captive Trucks
            </span>
          </div>
          <div className="mt-2 h-2 bg-[#1a2030] border border-[#2d3548]">
            <div
              className="h-full bg-[#8cff2e]"
              style={{
                width: `${Math.round(
                  (save.unlockedRiders.length / RIDERS.length) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Right-side Garage Workshop Panel */}
      <div className="pointer-events-auto w-full lg:w-[680px] xl:w-[740px] h-full bg-[#10131d]/96 border-l-2 border-[#2d3548] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b-2 border-[#262d3f] bg-[#141824] flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide uppercase text-[#f4efe6] leading-none">
              Midnight Chop Shop &amp; Roster
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-mono text-[#9aa3b2] tabular-nums">
              <span>Top {stats.mphMax} MPH</span>
              <span className="text-[#454f66]">·</span>
              <span>Integrity {stats.maxHp}</span>
              <span className="text-[#454f66]">·</span>
              <span>
                Dread ×{stats.dreadMultiplier.toFixed(2)}
              </span>
              <span className="text-[#454f66]">·</span>
              <span>
                Reach +{Math.round(stats.scareRadiusBonus)}m
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-[#0b0e16] border-2 border-[#ff7a29]/60 px-3 py-1.5 text-right">
              <div className="text-[10px] font-mono uppercase text-[#9aa3b2] leading-none">
                Dread Bank
              </div>
              <div className="font-mono text-lg font-bold text-[#ff7a29] tabular-nums leading-tight">
                {save.dread.toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={onPlayNow}
              className="bg-[#ff5412] hover:bg-[#ff6c30] text-[#0c0e14] font-display text-lg font-extrabold tracking-wider uppercase px-4 py-2 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Ride</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Garage"
              className="bg-[#1b2030] hover:bg-[#262d42] border border-[#343d54] text-[#f4efe6] p-2.5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 5 Tabs */}
        <div className="px-4 sm:px-5 pt-2.5 bg-[#121622] border-b border-[#262d3f] flex items-center gap-1 overflow-x-auto">
          {(
            [
              {
                id: 'riders',
                label: `Monsters (${save.unlockedRiders.length}/${RIDERS.length})`,
                icon: Users,
              },
              { id: 'bikes', label: 'Faster Bikes', icon: Bike },
              { id: 'parts', label: 'Custom Parts', icon: Wrench },
              { id: 'scares', label: 'Scare Powers', icon: Flame },
              { id: 'cosmetics', label: 'Cosmetics', icon: Sparkles },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  soundEngine.playGarageClick();
                  setTab(t.id);
                }}
                className={`px-3 py-2 font-display text-base tracking-wide uppercase flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-[#ff7a29] text-[#f4efe6] bg-[#1a2030]'
                    : 'border-transparent text-[#8f99ad] hover:text-[#f4efe6]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto ink-scroll p-4 sm:p-5">
          {/* TAB 1: ALL 51 COLORING-BOOK MONSTERS */}
          {tab === 'riders' && (
            <div className="space-y-4">
              {/* Inspected Monster Spotlight Card */}
              <div className="ink-card p-3.5 grid grid-cols-1 sm:grid-cols-[175px_1fr] gap-4">
                <div className="flex flex-col">
                  <MonsterArtwork
                    rider={inspectedRider}
                    locked={!inspectedUnlocked}
                    className="w-full h-40 sm:h-44 border-2 border-[#2e3547]"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-[#9aa3b2]">
                    <span>{inspectedRider.poolNumber}</span>
                    <span
                      style={{
                        color: inspectedUnlocked ? '#8cff2e' : '#ff7a29',
                      }}
                    >
                      {inspectedUnlocked
                        ? inspectedRescued
                          ? 'Rescued'
                          : 'Unlocked'
                        : 'Captive'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-2xl font-extrabold tracking-wide uppercase text-[#f4efe6] leading-none">
                          {inspectedRider.name}
                        </h3>
                        <div className="text-xs text-[#9aa3b2] mt-0.5">
                          {inspectedRider.epithet} · {inspectedRider.origin}
                        </div>
                      </div>
                      <span
                        className="w-3.5 h-3.5 shrink-0 border border-white/25 mt-1"
                        style={{ backgroundColor: inspectedRider.accentColor }}
                      />
                    </div>

                    <p className="text-xs text-[#cfd5e2] mt-2 leading-relaxed">
                      {inspectedRider.backstory}
                    </p>

                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-[#121622] border border-[#2a3142] p-2">
                        <div
                          className="text-[10px] font-mono uppercase font-bold"
                          style={{ color: inspectedRider.signatureColor }}
                        >
                          Signature Scare [Q] · {inspectedRider.signatureName}
                        </div>
                        <div className="text-[11px] text-[#bfc6d4] mt-0.5 leading-snug">
                          {inspectedRider.signatureDesc}
                        </div>
                      </div>
                      <div className="bg-[#121622] border border-[#2a3142] p-2">
                        <div className="text-[10px] font-mono uppercase font-bold text-[#8cff2e]">
                          Passive · {inspectedRider.passiveName}
                        </div>
                        <div className="text-[11px] text-[#bfc6d4] mt-0.5 leading-snug">
                          {inspectedRider.passiveDesc}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Row */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {inspectedUnlocked ? (
                      <button
                        type="button"
                        onClick={() => handleEquipRider(inspectedRider.id)}
                        disabled={inspectedEquipped}
                        className={`px-4 py-1.5 font-display text-base tracking-wider uppercase font-bold transition-colors ${
                          inspectedEquipped
                            ? 'bg-[#232b3d] text-[#8cff2e] border border-[#8cff2e]/50 cursor-default'
                            : 'bg-[#8cff2e] hover:bg-[#a6ff59] text-[#0c0e14] cursor-pointer'
                        }`}
                      >
                        {inspectedEquipped ? 'Currently Riding' : 'Equip Rider'}
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2.5 w-full justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-[#ffd166]">
                          <Truck className="w-4 h-4 shrink-0" />
                          <span>Break out of Highway Captive Truck for free</span>
                        </div>
                        <button
                          type="button"
                          disabled={save.dread < inspectedRider.cost}
                          onClick={() =>
                            handleBuyRider(inspectedRider.id, inspectedRider.cost)
                          }
                          className={`px-3.5 py-1.5 font-mono text-xs font-bold uppercase transition-colors ${
                            save.dread >= inspectedRider.cost
                              ? 'bg-[#ff7a29] hover:bg-[#ff944d] text-[#0c0e14] cursor-pointer'
                              : 'bg-[#1c2130] text-[#6d768a] border border-[#2b3245] cursor-not-allowed'
                          }`}
                        >
                          Early Unlock ({inspectedRider.cost} Dread)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Search & Collection Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#7c8599] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search all 51 cryptids by name, folklore, or pool #..."
                    className="w-full bg-[#141824] border border-[#2f3649] focus:border-[#ff7a29] outline-none pl-8 pr-3 py-1.5 text-xs text-[#f4efe6] placeholder:text-[#6f788c]"
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(
                    [
                      ['all', 'All 51'],
                      ['unlocked', `Unlocked (${save.unlockedRiders.length})`],
                      ['free', 'Free Pack'],
                      ['pool1', '#1–24'],
                      ['pool2', '#25–48'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRiderFilter(key)}
                      className={`px-2.5 py-1.5 text-xs font-mono border transition-colors cursor-pointer ${
                        riderFilter === key
                          ? 'bg-[#ff7a29] text-[#0c0e14] border-[#ff7a29] font-bold'
                          : 'bg-[#141824] text-[#9aa3b2] border-[#2d3548] hover:text-[#f4efe6]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 51-Monster Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {filteredRiders.map((r) => {
                  const unlocked = save.unlockedRiders.includes(r.id);
                  const equipped = save.equipped.rider === r.id;
                  const inspected = inspectedRiderId === r.id;

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playGarageClick();
                        setInspectedRiderId(r.id);
                        if (unlocked) handleEquipRider(r.id);
                      }}
                      className={`text-left border-2 p-1.5 transition-colors cursor-pointer bg-[#161a26] hover:bg-[#1e2436] ${
                        equipped
                          ? 'border-[#8cff2e]'
                          : inspected
                            ? 'border-[#ff7a29]'
                            : 'border-[#293042]'
                      }`}
                    >
                      <MonsterArtwork
                        rider={r}
                        locked={!unlocked}
                        className="w-full h-24 border border-[#2a3142]"
                      />
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <span className="font-display text-sm tracking-wide uppercase text-[#f4efe6] truncate">
                          {r.name}
                        </span>
                        {equipped ? (
                          <Check className="w-3.5 h-3.5 text-[#8cff2e] shrink-0" />
                        ) : !unlocked ? (
                          <Lock className="w-3 h-3 text-[#ff7a29] shrink-0" />
                        ) : null}
                      </div>
                      <div className="text-[10px] font-mono text-[#8b94a7] truncate">
                        {r.poolNumber} · {unlocked ? 'Playable' : `${r.cost} Dread`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: FASTER BIKES */}
          {tab === 'bikes' && (
            <div className="space-y-3">
              {BIKES.map((bike) => {
                const owned = save.unlockedBikes.includes(bike.id);
                const equipped = save.equipped.bike === bike.id;
                const canAfford = save.dread >= bike.cost;

                return (
                  <div
                    key={bike.id}
                    className={`ink-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-2 ${
                      equipped ? 'border-[#8cff2e]' : 'border-[#2a3142]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 border border-white/30 shrink-0"
                          style={{ backgroundColor: bike.tankColor }}
                        />
                        <h3 className="font-display text-xl font-bold tracking-wide uppercase text-[#f4efe6]">
                          {bike.name}
                        </h3>
                        <span className="text-xs font-mono text-[#9aa3b2]">
                          {bike.style}
                        </span>
                      </div>
                      <p className="text-xs text-[#c5ccd9] mt-1">
                        {bike.description}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-mono text-[#d8dee9] tabular-nums">
                        <span>Base {Math.round(bike.topSpeed * 2.15)} MPH</span>
                        <span className="text-[#4a5469]">·</span>
                        <span>Integrity {bike.maxHp}</span>
                        <span className="text-[#4a5469]">·</span>
                        <span>Handling {bike.turnRate.toFixed(1)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!owned && !canAfford}
                      onClick={() => handleBuyOrEquipBike(bike.id, bike.cost)}
                      className={`px-4 py-2 font-display text-base tracking-wider uppercase font-bold shrink-0 transition-colors ${
                        equipped
                          ? 'bg-[#222a3b] text-[#8cff2e] border border-[#8cff2e]/60 cursor-default'
                          : owned
                            ? 'bg-[#8cff2e] hover:bg-[#a6ff59] text-[#0c0e14] cursor-pointer'
                            : canAfford
                              ? 'bg-[#ff7a29] hover:bg-[#ff944d] text-[#0c0e14] cursor-pointer'
                              : 'bg-[#1a1f2d] text-[#6b7488] border border-[#2b3244] cursor-not-allowed'
                      }`}
                    >
                      {equipped
                        ? 'Equipped'
                        : owned
                          ? 'Equip Bike'
                          : `Buy · ${bike.cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: CUSTOM PARTS */}
          {tab === 'parts' && (
            <div className="space-y-5">
              {(['exhaust', 'wheels', 'headlight', 'nitro'] as PartSlot[]).map(
                (slot) => {
                  const slotParts = PARTS.filter((p) => p.slot === slot);
                  return (
                    <div key={slot}>
                      <h3 className="font-display text-lg font-bold tracking-wider uppercase text-[#ff7a29] mb-2">
                        {PART_SLOT_LABELS[slot]}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {slotParts.map((part) => {
                          const owned = save.unlockedParts.includes(part.id);
                          const equipped = save.equipped.parts[slot] === part.id;
                          const canAfford = save.dread >= part.cost;

                          const statLabels: string[] = [];
                          if (part.stats.speedBonus)
                            statLabels.push(
                              `+${Math.round(part.stats.speedBonus * 2.15)} MPH`,
                            );
                          if (part.stats.turnBonus)
                            statLabels.push(`+${part.stats.turnBonus} Handling`);
                          if (part.stats.scareRadiusBonus)
                            statLabels.push(
                              `+${part.stats.scareRadiusBonus}m Scare Reach`,
                            );
                          if (part.stats.scarePowerBonus)
                            statLabels.push(`+${part.stats.scarePowerBonus} Scare Power`);
                          if (part.stats.nitroDurationBonus)
                            statLabels.push(`+${part.stats.nitroDurationBonus}s Nitro`);
                          if (part.stats.nitroSpeedBonus)
                            statLabels.push(`+${part.stats.nitroSpeedBonus} Boost`);
                          if (part.stats.dreadMultBonus)
                            statLabels.push(
                              `+${Math.round(part.stats.dreadMultBonus * 100)}% Dread`,
                            );

                          return (
                            <div
                              key={part.id}
                              className={`ink-card p-3 flex flex-col justify-between gap-2.5 border-2 ${
                                equipped ? 'border-[#8cff2e]' : 'border-[#2a3142]'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-display text-lg font-bold tracking-wide uppercase text-[#f4efe6]">
                                    {part.name}
                                  </span>
                                  <span className="text-[10px] font-mono text-[#9aa3b2]">
                                    Tier {part.tier}
                                  </span>
                                </div>
                                <p className="text-xs text-[#b8c0cf] mt-0.5">
                                  {part.description}
                                </p>
                                {statLabels.length > 0 && (
                                  <div className="mt-1.5 text-[11px] font-mono text-[#8cff2e]">
                                    {statLabels.join(' · ')}
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                disabled={!owned && !canAfford}
                                onClick={() =>
                                  handleBuyOrEquipPart(part.id, slot, part.cost)
                                }
                                className={`w-full py-1.5 font-display text-sm tracking-wider uppercase font-bold transition-colors ${
                                  equipped
                                    ? 'bg-[#222a3b] text-[#8cff2e] border border-[#8cff2e]/60 cursor-default'
                                    : owned
                                      ? 'bg-[#8cff2e] hover:bg-[#a6ff59] text-[#0c0e14] cursor-pointer'
                                      : canAfford
                                        ? 'bg-[#ff7a29] hover:bg-[#ff944d] text-[#0c0e14] cursor-pointer'
                                        : 'bg-[#1a1f2d] text-[#6b7488] border border-[#2b3244] cursor-not-allowed'
                                }`}
                              >
                                {equipped
                                  ? 'Installed'
                                  : owned
                                    ? 'Install Part'
                                    : `Buy · ${part.cost} Dread`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}

          {/* TAB 4: 5 DISTINCT UPGRADABLE SCARE MECHANICS */}
          {tab === 'scares' && (
            <div className="space-y-3">
              {SCARE_MECHANICS.map((scare) => {
                const lv = save.scareLevels[scare.id] ?? 0;
                const isPrimary = save.equipped.activeScare === scare.id;
                const nextCost =
                  lv === 0
                    ? scare.unlockCost
                    : lv < 3
                      ? scare.upgradeCosts[lv - 1]
                      : null;
                const canAfford = nextCost !== null && save.dread >= nextCost;

                return (
                  <div
                    key={scare.id}
                    className="ink-card p-3.5 border-2"
                    style={{
                      borderColor: isPrimary ? scare.color : '#2a3142',
                    }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="font-mono text-xs font-bold px-1.5 py-0.5 bg-[#0c0e16] border border-[#343c50]"
                            style={{ color: scare.color }}
                          >
                            Key {scare.hotkey}
                          </span>
                          <h3 className="font-display text-xl font-bold tracking-wide uppercase text-[#f4efe6]">
                            {scare.name}
                          </h3>
                          <span className="text-xs font-mono text-[#9aa3b2]">
                            {scare.category} · {scare.complexity}
                          </span>
                          <span
                            className="text-xs font-mono font-bold"
                            style={{ color: lv > 0 ? '#8cff2e' : '#ff7a29' }}
                          >
                            {lv > 0 ? `Lv ${lv}/3` : 'Locked'}
                          </span>
                        </div>

                        <p className="text-xs text-[#cfd5e2] mt-1.5">
                          {scare.description}
                        </p>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div className="bg-[#121622] border border-[#282f40] p-2">
                            <span className="font-mono text-[#9aa3b2] uppercase">
                              Mounted:{' '}
                            </span>
                            <span className="text-[#e2e7f0]">
                              {scare.mountedEffect}
                            </span>
                          </div>
                          <div className="bg-[#121622] border border-[#282f40] p-2">
                            <span className="font-mono text-[#ffd166] uppercase">
                              On Foot:{' '}
                            </span>
                            <span className="text-[#e2e7f0]">
                              {scare.onFootEffect}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col gap-1.5 shrink-0">
                        {nextCost !== null ? (
                          <button
                            type="button"
                            disabled={!canAfford}
                            onClick={() => handleUpgradeScare(scare.id)}
                            className={`px-3.5 py-2 font-display text-sm tracking-wider uppercase font-bold transition-colors ${
                              canAfford
                                ? 'bg-[#ff7a29] hover:bg-[#ff944d] text-[#0c0e14] cursor-pointer'
                                : 'bg-[#1a1f2d] text-[#6b7488] border border-[#2b3244] cursor-not-allowed'
                            }`}
                          >
                            {lv === 0
                              ? `Unlock · ${nextCost}`
                              : `Upgrade Lv ${lv + 1} · ${nextCost}`}
                          </button>
                        ) : (
                          <div className="px-3.5 py-1.5 font-mono text-xs font-bold text-[#8cff2e] border border-[#8cff2e]/50 bg-[#1a241b] text-center">
                            MAX LEVEL
                          </div>
                        )}

                        {lv > 0 && (
                          <button
                            type="button"
                            onClick={() => handleSelectActiveScare(scare.id)}
                            disabled={isPrimary}
                            className={`px-3 py-1 text-xs font-mono uppercase transition-colors ${
                              isPrimary
                                ? 'bg-[#232b3d] text-[#8cff2e] cursor-default'
                                : 'bg-[#161c2b] hover:bg-[#232b3d] text-[#c9d0dc] border border-[#323a4f] cursor-pointer'
                            }`}
                          >
                            {isPrimary ? 'Spacebar Bound' : 'Bind to Space'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 5: TERRIFYING COSMETIC ACCESSORIES */}
          {tab === 'cosmetics' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COSMETICS.map((cos) => {
                const owned = save.unlockedCosmetics.includes(cos.id);
                const equipped = save.equipped.cosmetics.includes(cos.id);
                const canAfford = save.dread >= cos.cost;

                return (
                  <div
                    key={cos.id}
                    className={`ink-card p-3.5 flex flex-col justify-between gap-3 border-2 ${
                      equipped ? 'border-[#8cff2e]' : 'border-[#2a3142]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 border border-white/30"
                            style={{ backgroundColor: cos.accentColor }}
                          />
                          <h3 className="font-display text-xl font-bold tracking-wide uppercase text-[#f4efe6]">
                            {cos.name}
                          </h3>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#8cff2e]">
                          +{cos.dreadBonusPct}% Dread
                        </span>
                      </div>
                      <p className="text-xs text-[#c5ccd9] mt-1.5">
                        {cos.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={!owned && !canAfford}
                      onClick={() =>
                        handleBuyOrToggleCosmetic(cos.id, cos.cost)
                      }
                      className={`w-full py-2 font-display text-base tracking-wider uppercase font-bold transition-colors ${
                        equipped
                          ? 'bg-[#222a3b] hover:bg-[#2d374e] text-[#8cff2e] border border-[#8cff2e]/60 cursor-pointer'
                          : owned
                            ? 'bg-[#8cff2e] hover:bg-[#a6ff59] text-[#0c0e14] cursor-pointer'
                            : canAfford
                              ? 'bg-[#ff7a29] hover:bg-[#ff944d] text-[#0c0e14] cursor-pointer'
                              : 'bg-[#1a1f2d] text-[#6b7488] border border-[#2b3244] cursor-not-allowed'
                      }`}
                    >
                      {equipped
                        ? 'Equipped (Click to Remove)'
                        : owned
                          ? 'Equip Accessory'
                          : `Buy · ${cos.cost} Dread`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
