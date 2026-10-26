"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ScanResult = {
  ok: boolean;
  result: string;
  attendeeName?: string | null;
  details?: { attendee_name?: string; ticket_tier?: string; used_at?: string; short_id?: string };
};

const RESULT_COPY: Record<string, { title: string; tone: string; hint: string }> = {
  consumed: {
    title: "ADMIT",
    tone: "border-emerald-600 bg-emerald-50 text-emerald-900",
    hint: "Ticket accepted. It cannot be used again.",
  },
  already_used: {
    title: "ALREADY USED",
    tone: "border-amber-600 bg-amber-50 text-amber-900",
    hint: "This ticket was scanned before.",
  },
  event_ended: {
    title: "EVENT ENDED",
    tone: "border-amber-600 bg-amber-50 text-amber-900",
    hint: "The event window has closed.",
  },
  refunded: {
    title: "REFUNDED",
    tone: "border-destructive bg-destructive/5 text-destructive",
    hint: "Refunded tickets are not valid for entry.",
  },
  cancelled: {
    title: "CANCELLED",
    tone: "border-destructive bg-destructive/5 text-destructive",
    hint: "This order was cancelled.",
  },
  pending_payment: {
    title: "NOT PAID",
    tone: "border-destructive bg-destructive/5 text-destructive",
    hint: "The order never completed payment.",
  },
  unknown_token: {
    title: "NOT A TICKET",
    tone: "border-destructive bg-destructive/5 text-destructive",
    hint: "No attendee matches this code.",
  },
  wrong_event: {
    title: "WRONG EVENT",
    tone: "border-destructive bg-destructive/5 text-destructive",
    hint: "This ticket belongs to a different event.",
  },
};

type Props = {
  eventId: string;
  eventName: string;
};

/**
 * SAN-984 — staff scanner. Uses the platform barcode decoder where available
 * and always offers manual entry, so a denied camera never blocks the door.
 * It refuses to show success until the server returns `consumed`.
 */
export function TicketScanner({ eventId, eventName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect: (_source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } | null>(null);
  const busyRef = useRef(false);
  const lastDetectedTokenRef = useRef<string | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    lastDetectedTokenRef.current = null;
    detectorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => { track.stop(); });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const scan = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setNetworkError(null);
      try {
        const response = await fetch("/api/tickets/validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId, token: trimmed }),
        });
        const payload = (await response.json()) as ScanResult & { code?: string };
        if (!response.ok && !payload.result) {
          setResult({
            ok: false,
            result: payload.code === "WRONG_EVENT" ? "wrong_event" : payload.code ?? "error",
          });
        } else {
          setResult(payload);
        }
        setManualToken("");
      } catch {
        setNetworkError("Could not reach the server. The scan was NOT saved — scan again.");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [eventId],
  );

  async function startCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser cannot open a camera. Use manual entry.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }

      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (_options: { formats: string[] }) => {
            detect: (_source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      if (!Detector) {
        setCameraError(
          "This browser cannot decode QR codes. Keep the camera view for framing or use manual entry.",
        );
        return;
      }
      detectorRef.current = new Detector({ formats: ["qr_code"] });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current || !detectorRef.current) return;
        if (!busyRef.current) {
          try {
            const codes = await detectorRef.current.detect(videoRef.current);
            const value = codes[0]?.rawValue ?? null;
            // Scan a continuous view of the same QR only once. Arm again when
            // the QR leaves the frame, or immediately when a different QR appears.
            if (value && value !== lastDetectedTokenRef.current) {
              lastDetectedTokenRef.current = value;
              await scan(value);
            } else if (!value) {
              lastDetectedTokenRef.current = null;
            }
          } catch {
            // Transient decode failure while the camera focuses: ignore.
          }
        }
        if (streamRef.current) {
          scanTimerRef.current = window.setTimeout(() => { void tick(); }, 700);
        }
      };
      void tick();
    } catch {
      setCameraError("Camera permission was denied. Use manual entry below.");
      stopCamera();
    }
  }

  const copy = result ? RESULT_COPY[result.result] ?? {
    title: result.result.replaceAll("_", " ").toUpperCase(),
    tone: "border-destructive bg-destructive/5 text-destructive",
    hint: "Ticket not accepted.",
  } : null;

  const attendeeName = result?.details?.attendee_name ?? result?.attendeeName;
  const ticketTier = result?.details?.ticket_tier;

  return (
    <div className="space-y-6" data-testid="ticket-scanner">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold">Check in</h1>
        <p className="text-sm text-muted-foreground">
          Scanning for <span className="font-medium">{eventName}</span>. Each ticket is
          accepted once.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {cameraOn ? (
          <Button type="button" variant="outline" onClick={stopCamera}>
            Stop camera
          </Button>
        ) : (
          <Button type="button" onClick={startCamera} data-testid="scanner-enable-camera">
            Enable camera
          </Button>
        )}
      </div>

      <div className={cameraOn ? "block" : "hidden"}>
        <video
          ref={videoRef}
          data-testid="scanner-video"
          className="w-full max-w-md rounded-lg border border-border bg-black"
          muted
          playsInline
        />
      </div>
      {cameraError ? (
        <p className="text-sm text-muted-foreground" data-testid="scanner-camera-error">
          {cameraError}
        </p>
      ) : null}

      <form
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          void scan(manualToken);
        }}
        className="space-y-2 sm:max-w-md"
      >
        <Label htmlFor="scanner-token">Ticket code (manual entry)</Label>
        <div className="flex gap-2">
          <Input
            id="scanner-token"
            data-testid="scanner-manual-input"
            value={manualToken}
            onChange={(change) => { setManualToken(change.target.value); }}
            placeholder="Paste or type the ticket code"
            autoComplete="off"
          />
          <Button type="submit" disabled={busy || !manualToken.trim()} data-testid="scanner-submit">
            {busy ? "Checking…" : "Check in"}
          </Button>
        </div>
      </form>

      {networkError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {networkError}
        </p>
      ) : null}

      <div aria-live="assertive" data-testid="scanner-result">
        {copy ? (
          <div className={`rounded-lg border-2 p-4 ${copy.tone}`}>
            <p className="text-xl font-bold" data-testid="scanner-result-title">
              {copy.title}
            </p>
            {attendeeName ? (
              <p className="mt-1 text-sm">
                {attendeeName}
                {ticketTier ? ` · ${ticketTier}` : ""}
              </p>
            ) : null}
            {result?.details?.used_at ? (
              <p className="mt-1 text-sm">
                First used:{" "}
                {new Date(result.details.used_at).toLocaleString("en-US", {
                  timeZone: "America/Bogota",
                })}
              </p>
            ) : null}
            {result?.details?.short_id ? (
              <p className="mt-1 font-mono text-xs">{result.details.short_id}</p>
            ) : null}
            <p className="mt-2 text-xs">{copy.hint}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
