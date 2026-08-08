"use client";

import { useCallback, useEffect, useState } from "react";
import type { Moodboard, MoodboardItem } from "@/lib/db/moodboards";
import { authFetch } from "@/lib/supabase/session-ready";

export function useMoodboards(clientId: string) {
  const [boards, setBoards] = useState<Moodboard[]>([]);
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBoards = useCallback(async () => {
    const res = await authFetch(`/api/clients/${clientId}/moodboards`);
    if (!res.ok) return;
    const json = (await res.json()) as { moodboards: Moodboard[] };
    setBoards(json.moodboards);
  }, [clientId]);

  const loadItems = useCallback(async (boardId: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/moodboards/${boardId}/items`);
      if (res.ok) {
        const json = (await res.json()) as { items: MoodboardItem[] };
        setItems(json.items);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBoards(); }, [loadBoards]);
  useEffect(() => {
    if (selectedBoardId) void loadItems(selectedBoardId);
  }, [selectedBoardId, loadItems]);

  // Clear items when leaving a board here (not in an effect) so deselect is instant.
  const selectBoard = useCallback((id: string | null) => {
    setSelectedBoardId(id);
    if (!id) setItems([]);
  }, []);

  const createBoard = useCallback(async (name: string) => {
    const res = await fetch(`/api/clients/${clientId}/moodboards`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (res.ok) await loadBoards();
  }, [clientId, loadBoards]);

  const addItemUrl = useCallback(async (imageUrl: string) => {
    if (!selectedBoardId) return;
    const res = await fetch(`/api/moodboards/${selectedBoardId}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl }),
    });
    if (res.ok) await loadItems(selectedBoardId);
  }, [selectedBoardId, loadItems]);

  const removeItem = useCallback(async (itemId: string) => {
    if (!selectedBoardId) return;
    const res = await fetch(`/api/moodboards/${selectedBoardId}/items/${itemId}`, { method: "DELETE" });
    if (res.ok) await loadItems(selectedBoardId);
  }, [selectedBoardId, loadItems]);

  const refresh = useCallback(() => {
    void loadBoards();
    if (selectedBoardId) void loadItems(selectedBoardId);
  }, [loadBoards, loadItems, selectedBoardId]);

  return { boards, items, selectedBoardId, loading, selectBoard, createBoard, addItemUrl, removeItem, refresh };
}
