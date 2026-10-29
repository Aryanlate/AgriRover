/**
 * Subscribes to ESP32-CAM captures stored in Supabase.
 * Fetches the latest rows and then listens for new INSERTs via Realtime.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './client';

const PLANT_IMAGES_TABLE = 'plant_images';

export interface PlantImage {
  id: string;
  image_url: string;
  created_at: string;
  pose?: string | null;
  plant_id?: string | null;
}

export function usePlantImages(limit = 10) {
  const [images, setImages] = useState<PlantImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from(PLANT_IMAGES_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        setError(fetchError.message);
        console.warn('Supabase fetch failed:', fetchError.message);
      } else {
        setError(null);
        setImages((data as PlantImage[]) ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Supabase unreachable');
      console.warn('Supabase unreachable:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel('plant_images_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: PLANT_IMAGES_TABLE },
        (payload) => {
          setImages((prev) =>
            [payload.new as PlantImage, ...prev].slice(0, limit),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit, refresh]);

  return { images, loading, error, refresh };
}
