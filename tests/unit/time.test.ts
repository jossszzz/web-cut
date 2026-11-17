import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatTimecode,
  frameToUs,
  secondsToUs,
  snapToFrame,
  usToFrame,
  usToSeconds,
} from "@/core/types/time";

describe("time", () => {
  it("convierte segundos a microsegundos enteros", () => {
    expect(secondsToUs(1.5)).toBe(1_500_000);
    expect(secondsToUs(0.1 + 0.2)).toBe(300_000);
    expect(usToSeconds(2_500_000)).toBe(2.5);
  });

  it("calcula frames sin errores de redondeo", () => {
    expect(usToFrame(frameToUs(90, 30), 30)).toBe(90);
    expect(usToFrame(frameToUs(1001, 29.97), 29.97)).toBe(1001);
    expect(snapToFrame(1_010_000, 30)).toBe(frameToUs(30, 30));
  });

  it("formatea timecode HH:MM:SS:FF", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00:00");
    expect(formatTimecode(secondsToUs(61) + frameToUs(15, 30), 30)).toBe("00:01:01:15");
    expect(formatTimecode(secondsToUs(3600), 25)).toBe("01:00:00:00");
    expect(formatTimecode(-5, 30)).toBe("00:00:00:00");
  });

  it("formatea duraciones cortas", () => {
    expect(formatDuration(secondsToUs(65.25))).toBe("1:05.2");
    expect(formatDuration(0)).toBe("0:00.0");
  });
});
