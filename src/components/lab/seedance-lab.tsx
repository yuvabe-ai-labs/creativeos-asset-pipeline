"use client";

// EXPERIMENT (throwaway) — /lab/seedance probe UI.
// Two-step human-reference flow: Seedream face → Seedance video.

import { useCallback, useRef, useState } from "react";
import { Loader2, Image as ImageIcon, Clapperboard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RESOLUTIONS, RATIOS, TERMINAL_STATUSES } from "@/lib/lab/seedance/constants";
import { CallLog, type LoggedCall } from "./call-log";

const DEFAULT_FACE_PROMPT =
  "Photorealistic portrait of a cheerful young woman beauty influencer, natural makeup, " +
  "soft studio lighting, plain light background, looking directly at camera, upper body, " +
  "vertical composition";

const DEFAULT_MOTION_PROMPT =
  "The woman in Image 1 smiles and speaks directly to the camera, holding up a small " +
  "skincare jar. Energetic UGC advertising style.";

export function SeedanceLab() {
  const [facePrompt, setFacePrompt] = useState(DEFAULT_FACE_PROMPT);
  const [motionPrompt, setMotionPrompt] = useState(DEFAULT_MOTION_PROMPT);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [resolution, setResolution] = useState<string>("720p");
  const [ratio, setRatio] = useState<string>("adaptive");
  const [duration, setDuration] = useState("5");

  const [imageBusy, setImageBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [calls, setCalls] = useState<LoggedCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Guards the poll loop against a second run started before the first finished.
  const pollToken = useRef(0);

  const log = useCallback((label: string, payload: unknown) => {
    setCalls((prev) => [{ label, payload, at: new Date().toISOString() }, ...prev].slice(0, 20));
  }, []);

  async function generateFace() {
    setImageBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lab/seedance/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: facePrompt }),
      });
      const data = await res.json();
      log("POST /images/generations", data);
      if (data.imageUrl) {
        setReferenceUrl(data.imageUrl);
      } else {
        setError("Seedream returned no image — see the call log for the moderation reason.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seedream request failed");
    } finally {
      setImageBusy(false);
    }
  }

  async function generateVideo() {
    setVideoBusy(true);
    setError(null);
    setVideoUrl(null);
    setTaskStatus(null);
    const token = ++pollToken.current;

    try {
      const res = await fetch("/api/lab/seedance/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: motionPrompt,
          referenceUrl,
          resolution,
          ratio,
          duration: Number(duration) || 5,
        }),
      });
      const data = await res.json();
      log("POST /contents/generations/tasks", data);

      if (!data.taskId) {
        setError("Seedance refused the task — see the call log for the error code.");
        return;
      }
      await pollTask(data.taskId, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seedance request failed");
    } finally {
      if (token === pollToken.current) setVideoBusy(false);
    }
  }

  async function pollTask(taskId: string, token: number) {
    // Generation ran ~80s in testing; 5s x 90 leaves generous headroom.
    for (let i = 0; i < 90; i++) {
      if (token !== pollToken.current) return;
      await new Promise((r) => setTimeout(r, 5000));

      const res = await fetch(`/api/lab/seedance/video/${taskId}`);
      const data = await res.json();
      setTaskStatus(data.taskStatus);

      if (data.taskStatus && TERMINAL_STATUSES.includes(data.taskStatus)) {
        log(`GET /tasks/${taskId}`, data);
        if (data.videoUrl) setVideoUrl(data.videoUrl);
        else setError(`Task ended as "${data.taskStatus}" — see the call log.`);
        return;
      }
    }
    setError("Timed out after 7.5 minutes.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        {/* Step 1 — the face */}
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-eyebrow">Step 1 · Seedream presenter</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Seedance rejects uploaded photos of real faces. A Seedream 5.0 text-to-image
            output is trusted as an input asset for 30 days — but only unmodified, so the
            URL below is passed through verbatim.
          </p>
          <Textarea
            value={facePrompt}
            onChange={(e) => setFacePrompt(e.target.value)}
            rows={3}
            placeholder="Describe the presenter…"
          />
          <div className="flex items-center gap-3">
            <Button onClick={generateFace} disabled={imageBusy}>
              {imageBusy && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
              {imageBusy ? "Generating…" : "Generate presenter"}
            </Button>
            {referenceUrl && <Badge variant="secondary">Reference ready</Badge>}
          </div>

          {referenceUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={referenceUrl}
              alt="Generated presenter"
              className="max-h-80 rounded-xl border border-neutral-200 object-contain"
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ref-url">Reference URL</Label>
            <Input
              id="ref-url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="Paste a Seedream URL or asset://<digital-character-id>"
            />
          </div>
        </Card>

        {/* Step 2 — the video */}
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Clapperboard className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-eyebrow">Step 2 · Seedance video</span>
          </div>
          <Textarea
            value={motionPrompt}
            onChange={(e) => setMotionPrompt(e.target.value)}
            rows={3}
            placeholder="Describe the motion and dialogue…"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={(v) => setResolution(v ?? "720p")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ratio</Label>
              <Select value={ratio} onValueChange={(v) => setRatio(v ?? "adaptive")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIOS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="duration">Duration (s)</Label>
              <Input
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={generateVideo} disabled={videoBusy || !motionPrompt.trim()}>
              {videoBusy && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
              {videoBusy ? "Generating…" : "Generate video"}
            </Button>
            {taskStatus && <Badge variant="secondary">{taskStatus}</Badge>}
          </div>

          {videoUrl && (
            <div className="space-y-2">
              <video src={videoUrl} controls className="w-full rounded-xl border border-neutral-200" />
              <p className="text-xs text-neutral-500">
                Signed URL — expires in 24 hours. Download it now if you want to keep it.
              </p>
            </div>
          )}
        </Card>

        {error && (
          <Card className="flex items-start gap-3 border-destructive/30 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.5} />
            <p className="text-sm text-destructive">{error}</p>
          </Card>
        )}
      </div>

      <CallLog calls={calls} />
    </div>
  );
}
