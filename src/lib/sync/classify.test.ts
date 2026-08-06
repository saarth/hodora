import { describe, expect, it } from "vitest";
import {
  classifySyncPair,
  type LocalRideInfo,
  type MappingInfo,
  type RemoteFileInfo,
} from "./classify";

const T1 = "2026-08-01T00:00:00.000Z";
const T2 = "2026-08-02T00:00:00.000Z";

const local = (updatedAt: string): LocalRideInfo => ({ updatedAt });
const remote = (etag: string, lastModified: string | null = null): RemoteFileInfo => ({
  etag,
  lastModified,
});
const mapping = (localUpdatedAt: string | null, remoteEtag: string | null): MappingInfo => ({
  localUpdatedAt,
  remoteEtag,
});

describe("classifySyncPair", () => {
  const cases: [
    string,
    Parameters<typeof classifySyncPair>,
    ReturnType<typeof classifySyncPair>,
  ][] = [
    ["new local ride, never synced, no remote file", [local(T1), null, null], "upload-new"],
    ["new remote file, never synced, no local ride", [null, null, remote("e1")], "download-new"],
    [
      "neither side exists and there's no mapping — nothing to do",
      [null, null, null],
      "stale-cleanup",
    ],
    [
      "both sides exist with no mapping (lost mapping row) — treated as a conflict, not a silent pick",
      [local(T1), null, remote("e1")],
      "conflict",
    ],
    [
      "mapping exists but both sides are now gone — stale row to clean up",
      [null, mapping(T1, "e1"), null],
      "stale-cleanup",
    ],
    [
      "ride deleted locally, remote file still there — propagate the delete",
      [null, mapping(T1, "e1"), remote("e1")],
      "delete-remote",
    ],
    [
      "remote file deleted, local ride unchanged since last sync — propagate the delete locally",
      [local(T1), mapping(T1, "e1"), null],
      "delete-local",
    ],
    [
      "remote file deleted, but local ride changed since last sync — the newer edit wins, re-upload",
      [local(T2), mapping(T1, "e1"), null],
      "upload",
    ],
    [
      "only the local ride changed since last sync",
      [local(T2), mapping(T1, "e1"), remote("e1")],
      "upload",
    ],
    [
      "only the remote file changed since last sync",
      [local(T1), mapping(T1, "e1"), remote("e2")],
      "download",
    ],
    ["neither side changed since last sync", [local(T1), mapping(T1, "e1"), remote("e1")], "noop"],
    [
      "both sides changed since last sync — a true conflict",
      [local(T2), mapping(T1, "e1"), remote("e2")],
      "conflict",
    ],
    [
      "mapping has a null localUpdatedAt baseline (first sync raced) — local counts as changed",
      [local(T1), mapping(null, "e1"), remote("e1")],
      "upload",
    ],
    [
      "mapping has a null remoteEtag baseline (first sync raced) — remote counts as changed",
      [local(T1), mapping(T1, null), remote("e1")],
      "download",
    ],
  ];

  it.each(cases)("%s", (_name, args, expected) => {
    expect(classifySyncPair(...args)).toBe(expected);
  });
});
