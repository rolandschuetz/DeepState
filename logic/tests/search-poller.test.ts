import { describe, expect, it, vi } from "vitest";

import {
  createScreenpipeSearchPoller,
  normalizeScreenpipeRecordTimestamps,
} from "../src/index.js";

describe("normalizeScreenpipeRecordTimestamps", () => {
  it("normalizes known timestamp fields to UTC recursively", () => {
    expect(
      normalizeScreenpipeRecordTimestamps({
        created_at: "2026-04-18T12:00:00+02:00",
        nested: {
          endAt: "2026-04-18T11:45:00+02:00",
        },
      }),
    ).toEqual({
      created_at: "2026-04-18T10:00:00.000Z",
      nested: {
        endAt: "2026-04-18T09:45:00.000Z",
      },
    });
  });
});

describe("createScreenpipeSearchPoller", () => {
  it("polls /search with the initial lookback window", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: [
          {
            id: "event_1",
            timestamp: "2026-04-18T10:00:00Z",
          },
        ],
      }), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }))
    );
    const poller = createScreenpipeSearchPoller({
      baseUrl: "http://127.0.0.1:3030/",
      fetch: fetchImpl,
      initialLookbackMs: 60_000,
      limit: 10,
    });

    const result = await poller.poll({
      endAt: "2026-04-18T10:01:00Z",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:3030/search?end_time=2026-04-18T10%3A01%3A00Z&limit=10&start_time=2026-04-18T10%3A00%3A00.000Z",
    );
    expect(result.requestWindow).toEqual({
      endAt: "2026-04-18T10:01:00Z",
      startAt: "2026-04-18T10:00:00.000Z",
    });
    expect(result.cursor.lastSuccessfulIngestAt).toBe("2026-04-18T10:00:00.000Z");
    expect(result.records).toHaveLength(1);
  });

  it("deduplicates overlapping records across polls", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: [
          {
            id: "event_1",
            timestamp: "2026-04-18T10:00:00Z",
          },
          {
            id: "event_2",
            timestamp: "2026-04-18T10:00:20Z",
          },
          {
            id: "event_2",
            timestamp: "2026-04-18T10:00:20Z",
          },
        ],
      }), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }))
    );
    const poller = createScreenpipeSearchPoller({
      baseUrl: "http://127.0.0.1:3030",
      fetch: fetchImpl,
      overlapMs: 15_000,
    });

    const result = await poller.poll({
      cursor: {
        lastSuccessfulIngestAt: "2026-04-18T10:00:10Z",
        recentRecordKeys: ["id:event_1"],
      },
      endAt: "2026-04-18T10:00:30Z",
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:3030/search?end_time=2026-04-18T10%3A00%3A30Z&limit=250&start_time=2026-04-18T09%3A59%3A55.000Z",
    );
    expect(result.deduplicatedCount).toBe(2);
    expect(result.records).toEqual([
      {
        id: "event_2",
        timestamp: "2026-04-18T10:00:20.000Z",
      },
    ]);
    expect(result.cursor).toEqual({
      lastSuccessfulIngestAt: "2026-04-18T10:00:20.000Z",
      recentRecordKeys: ["id:event_1", "id:event_2"],
    });
  });

  it("drops records outside the requested lookback window after UTC normalization", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({
        data: [
          {
            id: "event_old",
            timestamp: "2026-04-18T09:58:59Z",
          },
          {
            id: "event_keep",
            timestamp: "2026-04-18T12:00:05+02:00",
          },
          {
            id: "event_future",
            timestamp: "2026-04-18T10:01:01Z",
          },
        ],
      }), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }))
    );
    const poller = createScreenpipeSearchPoller({
      baseUrl: "http://127.0.0.1:3030",
      fetch: fetchImpl,
      initialLookbackMs: 60_000,
    });

    const result = await poller.poll({
      endAt: "2026-04-18T10:01:00Z",
    });

    expect(result.records).toEqual([
      {
        id: "event_keep",
        timestamp: "2026-04-18T10:00:05.000Z",
      },
    ]);
    expect(result.cursor.lastSuccessfulIngestAt).toBe("2026-04-18T10:01:01.000Z");
  });
});
