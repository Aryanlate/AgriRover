import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Navigation,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Droplets,
  Sparkles,
  HelpCircle,
  SearchX,
  Target,
} from 'lucide-react';
import { apiClient } from '../services/api/client';
import { useMissionRunner } from '../mission/useMissionRunner';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PlantTile, type PlantStatus } from '../components/ui/PlantTile';
import { EmptyState } from '../components/ui/EmptyState';

interface GridPlant {
  id: number | string;
  plantId: string;
  species: string;
  rowLetter: string;
  plantNumber: number;
  status: PlantStatus;
  moisture?: number;
  confidence?: number;
  wateredMl?: number;
  treatedMl?: number;
}

export const FieldMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { snapshot } = useMissionRunner();
  const { telemetry, mode } = useRoverStore();

  const [loading, setLoading] = useState(true);
  const [plants, setPlants] = useState<GridPlant[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'all' | PlantStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Determine which plant the rover is currently at
  // 0-indexed: index 0 -> A1, index 1 -> A2, etc. (5 per row)
  const currentRoverPlantIndex = snapshot.status === 'running' || snapshot.status === 'paused'
    ? snapshot.currentPlantIndex
    : 0;

  const fetchPlants = async () => {
    setLoading(true);
    try {
      const backendPlants = await apiClient.listPlants();

      if (backendPlants && backendPlants.length > 0) {
        // Map backend plants
        const mapped: GridPlant[] = backendPlants.map((p, idx) => {
          // If plant_id has pattern like A1, B3
          const match = p.plant_id.match(/^([A-Za-z]+)(\d+)$/);
          let rowLetter = 'A';
          let plantNumber = idx + 1;

          if (match) {
            rowLetter = match[1].toUpperCase();
            plantNumber = parseInt(match[2], 10);
          } else {
            // Assign 5 plants per row (A, B, C...)
            const rowIndex = Math.floor(idx / 5);
            rowLetter = String.fromCharCode(65 + rowIndex); // A, B, C
            plantNumber = (idx % 5) + 1;
          }

          let normalizedStatus: PlantStatus = 'not scanned';
          const s = (p.status || '').toLowerCase();
          if (s === 'healthy') normalizedStatus = 'healthy';
          else if (s === 'disease' || s === 'diseased') normalizedStatus = 'disease';
          else if (s === 'watered') normalizedStatus = 'watered';
          else if (s === 'needs water' || s === 'needs_water') normalizedStatus = 'needs water';
          else if (s === 'treated') normalizedStatus = 'treated';
          else if (s === 'unsure') normalizedStatus = 'unsure';
          else if (s === 'no plant found' || s === 'no_plant') normalizedStatus = 'no plant found';

          return {
            id: p.id,
            plantId: p.plant_id || `${rowLetter}${plantNumber}`,
            species: p.species || 'Tomato',
            rowLetter,
            plantNumber,
            status: normalizedStatus,
            wateredMl: p.watered_ml,
            treatedMl: p.treated_ml,
          };
        });
        setPlants(mapped);
      } else {
        // Generate default 3 greenhouse beds (Rows A, B, C with 5 plants each)
        const defaultBeds: GridPlant[] = [];
        const rows = ['A', 'B', 'C'];
        let idCounter = 1;

        rows.forEach((rowLetter) => {
          for (let pNum = 1; pNum <= 5; pNum++) {
            let status: PlantStatus = 'not scanned';
            let moisture = 40;
            let confidence = 0.92;

            // Give representative initial demo statuses across the beds
            if (rowLetter === 'A') {
              if (pNum === 1) { status = 'watered'; moisture = 52; }
              else if (pNum === 2) { status = 'healthy'; moisture = 45; }
              else if (pNum === 3) { status = 'disease'; moisture = 28; confidence = 0.88; }
              else if (pNum === 4) { status = 'treated'; moisture = 44; }
              else { status = 'needs water'; moisture = 22; }
            } else if (rowLetter === 'B') {
              if (pNum === 1) { status = 'healthy'; moisture = 48; }
              else if (pNum === 2) { status = 'unsure'; moisture = 36; confidence = 0.62; }
              else if (pNum === 3) { status = 'healthy'; moisture = 42; }
              else if (pNum === 4) { status = 'no plant found'; }
              else { status = 'healthy'; moisture = 46; }
            } else {
              status = 'not scanned';
            }

            defaultBeds.push({
              id: idCounter,
              plantId: `${rowLetter}${pNum}`,
              species: 'Tomato (Roma VF)',
              rowLetter,
              plantNumber: pNum,
              status,
              moisture: status !== 'no plant found' && status !== 'not scanned' ? moisture : undefined,
              confidence: confidence,
            });
            idCounter++;
          }
        });
        setPlants(defaultBeds);
      }
    } catch (err) {
      console.warn('API error fetching plants, loading standard greenhouse layout:', err);
      // Fallback standard layout
      const fallbackBeds: GridPlant[] = [];
      const rows = ['A', 'B', 'C'];
      let idCounter = 1;
      rows.forEach((rowLetter) => {
        for (let pNum = 1; pNum <= 5; pNum++) {
          fallbackBeds.push({
            id: idCounter,
            plantId: `${rowLetter}${pNum}`,
            species: 'Tomato',
            rowLetter,
            plantNumber: pNum,
            status: pNum === 1 && rowLetter === 'A' ? 'healthy' : pNum === 3 ? 'disease' : 'not scanned',
          });
          idCounter++;
        }
      });
      setPlants(fallbackBeds);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, []);

  // Filter and search
  const filteredPlants = plants.filter((p) => {
    const matchesFilter = selectedFilter === 'all' || p.status === selectedFilter;
    const matchesSearch =
      p.plantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.species.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Group by Row Letter (A, B, C...)
  const rows = Array.from(new Set(filteredPlants.map((p) => p.rowLetter))).sort();

  // Status counts for legend
  const countByStatus = (status: PlantStatus) => plants.filter((p) => p.status === status).length;

  // Active rover plant label
  const activeRoverPlant = plants[currentRoverPlantIndex] || plants[0];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
              Greenhouse Map
            </h1>
            <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              Live Field Layout
            </span>
          </div>
          <p className="text-sm font-medium text-text-muted mt-1">
            2D spatial map of greenhouse beds (Rows A, B, C) with individual plant health, moisture, and real-time rover marker.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={fetchPlants}
            icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh Grid
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate('/mission')}
            icon={<Target className="w-4 h-4" />}
          >
            Autonomous Mission
          </Button>
        </div>
      </div>

      {/* Rover Location Tracker Banner */}
      <Card variant="default" className="p-4 bg-surface border-2 border-border flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-3 rounded-2xl bg-primary/10 border-2 border-primary/30 text-primary flex-shrink-0 animate-pulse">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-text-muted">Rover Current Waypoint:</span>
              <span className="text-sm font-black text-text-main px-2 py-0.5 rounded bg-app border border-border">
                {activeRoverPlant ? `Plant ${activeRoverPlant.plantId} (Bed ${activeRoverPlant.rowLetter})` : 'Origin (A1)'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Operating Mode: <strong className="uppercase text-text-main">{mode}</strong> •
              Sub-step: <strong className="text-text-main">{snapshot.subStep}</strong> •
              Encoder: <strong className="tabular-nums text-text-main">
                {telemetry?.enc ? `${telemetry.enc.l} / ${telemetry.enc.r}` : '0 / 0'} ticks
              </strong>
            </p>
          </div>
        </div>

        {activeRoverPlant && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => navigate(`/plants/${activeRoverPlant.id}`)}
            className="w-full md:w-auto"
          >
            Inspect Current Plant ({activeRoverPlant.plantId}) →
          </Button>
        )}
      </Card>

      {/* Filter and Legend Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-2xl border-2 border-border bg-surface">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plant ID (e.g. A1, B3)..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-app text-text-main text-xs font-bold focus:outline-none focus:border-primary"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              selectedFilter === 'all'
                ? 'bg-primary text-surface border-primary'
                : 'bg-app text-text-muted border-border hover:text-text-main'
            }`}
          >
            All ({plants.length})
          </button>
          <button
            onClick={() => setSelectedFilter('healthy')}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
              selectedFilter === 'healthy'
                ? 'bg-primary text-surface border-primary'
                : 'bg-app text-primary border-primary/30 hover:bg-surface'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Healthy ({countByStatus('healthy')})
          </button>
          <button
            onClick={() => setSelectedFilter('disease')}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
              selectedFilter === 'disease'
                ? 'bg-danger text-surface border-danger'
                : 'bg-app text-danger border-danger/30 hover:bg-surface'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Disease ({countByStatus('disease')})
          </button>
          <button
            onClick={() => setSelectedFilter('watered')}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
              selectedFilter === 'watered'
                ? 'bg-water text-surface border-water'
                : 'bg-app text-water border-water/30 hover:bg-surface'
            }`}
          >
            <Droplets className="w-3.5 h-3.5" /> Watered ({countByStatus('watered')})
          </button>
          <button
            onClick={() => setSelectedFilter('treated')}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
              selectedFilter === 'treated'
                ? 'bg-treated text-surface border-treated'
                : 'bg-app text-treated border-treated/30 hover:bg-surface'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Treated ({countByStatus('treated')})
          </button>
          <button
            onClick={() => setSelectedFilter('unsure')}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
              selectedFilter === 'unsure'
                ? 'bg-unsure text-surface border-unsure'
                : 'bg-app text-unsure border-unsure/30 hover:bg-surface'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" /> Unsure ({countByStatus('unsure')})
          </button>
          <button
            onClick={() => setSelectedFilter('not scanned')}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              selectedFilter === 'not scanned'
                ? 'bg-text-muted text-surface border-text-muted'
                : 'bg-app text-text-muted border-border hover:bg-surface'
            }`}
          >
            Not Scanned ({countByStatus('not scanned')})
          </button>
          <button
            onClick={() => setSelectedFilter('no plant found')}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
              selectedFilter === 'no plant found'
                ? 'bg-text-muted text-surface border-text-muted'
                : 'bg-app text-text-muted border-border hover:bg-surface'
            }`}
          >
            <SearchX className="w-3.5 h-3.5" /> Empty Spot ({countByStatus('no plant found')})
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <Card variant="default" className="p-12 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mb-3" />
          <p className="text-base font-bold text-text-main">Mapping Greenhouse Beds...</p>
          <p className="text-xs text-text-muted mt-1">Retrieving plant spatial indices and classification records from backend.</p>
        </Card>
      )}

      {/* Empty State */}
      {!loading && filteredPlants.length === 0 && (
        <EmptyState
          icon={<Filter className="w-10 h-10 text-text-muted" />}
          title="No Plants Match Selected Filter"
          message={`No greenhouse plants found with status "${selectedFilter}" or matching search query "${searchQuery}".`}
          actionLabel="Reset Filters"
          onAction={() => {
            setSelectedFilter('all');
            setSearchQuery('');
          }}
        />
      )}

      {/* Greenhouse Beds Layout (Rows Lettered A, B, C...) */}
      {!loading && rows.length > 0 && (
        <div className="space-y-6">
          {rows.map((rowLetter) => {
            const plantsInRow = filteredPlants
              .filter((p) => p.rowLetter === rowLetter)
              .sort((a, b) => a.plantNumber - b.plantNumber);

            return (
              <Card
                key={rowLetter}
                variant="default"
                className="p-5 border-2 border-border"
              >
                {/* Bed Header */}
                <div className="flex items-center justify-between pb-3 mb-4 border-b-2 border-border">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-app border-2 border-border font-black text-sm text-text-main flex items-center justify-center">
                      {rowLetter}
                    </span>
                    <div>
                      <h3 className="text-base font-black text-text-main">
                        Greenhouse Bed Row {rowLetter}
                      </h3>
                      <p className="text-xs text-text-muted">
                        Substrate: Coco Coir Slabs • Drip Emitters active • {plantsInRow.length} plants in row
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-text-muted">
                    Click plant tile for full detail
                  </span>
                </div>

                {/* Plants in this Bed */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {plantsInRow.map((plant) => {
                    // Check if rover is currently stationed at this plant
                    const isRoverHere =
                      activeRoverPlant?.plantId === plant.plantId ||
                      (activeRoverPlant?.rowLetter === plant.rowLetter &&
                        activeRoverPlant?.plantNumber === plant.plantNumber);

                    return (
                      <PlantTile
                        key={plant.id}
                        id={plant.plantId}
                        plantName={plant.species}
                        status={plant.status}
                        row={rowLetter.charCodeAt(0) - 64}
                        col={plant.plantNumber}
                        moisture={plant.moisture}
                        confidence={plant.confidence}
                        isRoverHere={isRoverHere}
                        onClick={() => navigate(`/plants/${plant.id}`)}
                      />
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
