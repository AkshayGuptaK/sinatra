export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  mood?: string;
  duration: number;
  // Raw scores dictionary (e.g. { "energizing/pump-up": 0.55, ... })
  emotions?: Record<string, number> | null;
  // 2D manifold projection coordinates
  coord_x?: number | null;
  coord_y?: number | null;
}
