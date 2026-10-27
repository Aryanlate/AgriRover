import React from 'react';
import { Navigation } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PlantTile } from '../components/ui/PlantTile';

export const FieldMapPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Field & Plant Bed Map
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            2D spatial map of greenhouse crops, plant indices, and rover waypoint navigation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Greenhouse Bed Layout (Row A)" variant="default" className="p-6 lg:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <PlantTile
              id="p1"
              plantName="Tomato #1"
              status="disease"
              moisture={28}
              row={1}
              col={1}
              selected={true}
            />
            <PlantTile
              id="p2"
              plantName="Tomato #2"
              status="healthy"
              moisture={45}
              row={1}
              col={2}
            />
            <PlantTile
              id="p3"
              plantName="Tomato #3"
              status="unsure"
              moisture={32}
              row={1}
              col={3}
            />
            <PlantTile
              id="p4"
              plantName="Tomato #4"
              status="needs water"
              moisture={22}
              row={1}
              col={4}
            />
          </div>
        </Card>

        <Card title="Navigation & Coordinates" variant="default" className="p-6">
          <EmptyState
            icon={<Navigation className="w-10 h-10" />}
            title="Encoder Odometry"
            message="Rover tracks linear position via debounced wheel pulse encoders and heading hold via MPU6050 IMU."
          />
        </Card>
      </div>
    </div>
  );
};
