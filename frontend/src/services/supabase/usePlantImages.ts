/**
 * Subscribes to ESP32-CAM captures stored in Supabase.
 * Fetches the latest rows and then listens for new INSERTs via Realtime.
 */

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;

    const fetchImages = async () => {
      try {
        const { data, error } = await supabase
          .from(PLANT_IMAGES_TABLE)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!cancelled) {
          if (error) {
            console.warn('Supabase fetch failed:', error.message);
          } else if (data) {
            setImages(data as PlantImage[]);
          }
        }
      } catch (err) {
        console.warn('Supabase unreachable:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchImages();

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
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { images, loading };
}
