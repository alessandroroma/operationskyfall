// Where to watch: national TV + streaming from ESPN's broadcast data.
export function whereToWatch(event) {
  const comp = event?.competitions?.[0];
  if (!comp) return { tv: [], streaming: [] };
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const geo = comp.geoBroadcasts ?? [];
  const pick = (kind) =>
    geo
      .filter((g) => g?.type?.shortName === kind && (g?.market?.type ?? "National") === "National")
      .map((g) => g?.media?.shortName);
  let tv = uniq(pick("TV"));
  const streaming = uniq(pick("Streaming"));
  if (!tv.length && !streaming.length) {
    tv = uniq((comp.broadcasts ?? []).flatMap((b) => b?.names ?? []));
  }
  return { tv, streaming };
}

export function watchText({ tv, streaming }) {
  const parts = [];
  if (tv.length) parts.push(tv.join(", "));
  if (streaming.length) parts.push(`stream: ${streaming.join(", ")}`);
  return parts.join(" · ");
}
