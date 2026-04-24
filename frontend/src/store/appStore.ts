import { create } from 'zustand';

interface AppState {
  orgId: string | null;
  activeQuery: string;
  isResearching: boolean;
  streamingSection: string | null;
  setOrgId: (id: string | null) => void;
  setActiveQuery: (q: string) => void;
  setIsResearching: (v: boolean) => void;
  setStreamingSection: (s: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  orgId: null,
  activeQuery: '',
  isResearching: false,
  streamingSection: null,
  setOrgId: (id) => set({ orgId: id }),
  setActiveQuery: (q) => set({ activeQuery: q }),
  setIsResearching: (v) => set({ isResearching: v }),
  setStreamingSection: (s) => set({ streamingSection: s }),
}));
